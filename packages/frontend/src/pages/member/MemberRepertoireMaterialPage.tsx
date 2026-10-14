import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { MediaModal } from '@/components/media/MediaModal';
import {
  FileText,
  Music,
  Video,
  Volume2,
  Eye,
  ArrowLeft,
  Heart,
  ListPlus,
} from 'lucide-react';
import axios from 'axios';
import styles from './MemberRepertoireMaterialPage.module.scss';
import type { Material } from '@/types/index';
import { MaterialNameLines } from '@/components/materials/MaterialNameLines';
import { useAuth } from '@/context/AuthContext';
import { useMusicPlayerOverlay } from '@/context/MusicPlayerOverlayContext';
import {
  getMaterialFileCategory,
  isModalPreviewableFile,
  isPlayableAudioFile,
} from '@/utils/media';
import {
  compareMaterialLabels,
  displayMaterialLabel,
  materialLabelText,
  memberMaterialSection,
  washShoutedText,
  type MaterialNameParts,
  type MemberMaterialSection,
} from '@/utils/materialLabel';
import { useFavorites } from '@/hooks/useFavorites';
import { AddToPlaylistModal } from '@/components/music/AddToPlaylistModal';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

function splitRepertoireHeading(raw: string | undefined): { title: string; artist: string } {
  const value = raw?.trim() ?? '';
  if (!value) return { title: 'Material', artist: '' };
  const parts = value.split(/\s+-\s+/);
  const artist = parts.slice(1).join(' - ').trim();
  if (parts.length >= 2 && parts[0]?.trim() && artist) {
    return { title: parts[0].trim(), artist };
  }
  return { title: value, artist: '' };
}

function isHiddenSystemFile(material: Material): boolean {
  const raw = material.filePath || material.fileKey || material.title || '';
  const base = (raw.split('/').pop() || raw).trim();
  if (!base) return false;
  return base.startsWith('.') || /^thumbs\.db$/i.test(base);
}

type LabeledMaterial = {
  material: Material;
  label: MaterialNameParts;
};

interface MaterialSectionProps {
  title: string;
  files: LabeledMaterial[];
  /** Spela via musik-overlay: initialRepertoireId + repertoirePlayback (ingen libraryQueueMaterials). */
  onPlayMaterial?: (material: Material) => void;
  onView: (material: Material) => void;
  /** Markerar rad som aktiv i den globala spelaren (samma grupp). */
  activeMaterialId?: string | null;
  isPlaying?: boolean;
  /** När satt: visar favorit-knapp för spelbara ljudfiler i listan */
  favoriteMaterialIds?: string[];
  onToggleFavorite?: (materialId: string, materialHint?: Material) => void;
  /** Öppnar "lägg till i spellista" för spelbara ljudfiler */
  onOpenAddToPlaylist?: (materialId: string) => void;
}

const MaterialSection: React.FC<MaterialSectionProps> = ({
  title,
  files,
  onPlayMaterial,
  onView,
  activeMaterialId,
  isPlaying,
  favoriteMaterialIds,
  onToggleFavorite,
  onOpenAddToPlaylist,
}) => {
  if (files.length === 0) return null;

  const getFileIcon = (fileKey: string = '') => {
    const cat = getMaterialFileCategory(fileKey);
    if (cat === 'audio' || /\.ogg$/i.test(fileKey)) return <Music size={20} className={styles.fileIcon} />;
    if (cat === 'video') return <Video size={20} className={styles.fileIcon} />;
    if (cat === 'document') return <FileText size={20} className={styles.fileIcon} />;
    return <FileText size={20} className={styles.fileIcon} />;
  };

  return (
    <section className={styles.materialSection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.materialList}>
        {files.map(({ material, label }) => {
          if (!material.fileKey) return null;
          const displayName = materialLabelText(label);

          const isAudio = isPlayableAudioFile(material.fileKey);
          const canPreview = isModalPreviewableFile(material.fileKey) && !isAudio;
          const isActiveTrack = isAudio && activeMaterialId === material.materialId;
          const openMaterial = () => {
            if (isAudio && onPlayMaterial) {
              onPlayMaterial(material);
              return;
            }
            if (canPreview) {
              onView({ ...material, title: displayName });
            }
          };
          const canActivate = (isAudio && Boolean(onPlayMaterial)) || canPreview;
          const rowLabel = isAudio
            ? isActiveTrack
              ? `Spelas nu: ${displayName}. Öppna musikspelaren`
              : `Spela ${displayName}`
            : `Visa ${displayName}`;
          const rowBody = (
            <>
              <span className={styles.itemInfo}>
                {isActiveTrack ? (
                  <Volume2
                    size={20}
                    strokeWidth={2}
                    className={isPlaying ? styles.playIconPulse : styles.fileIcon}
                    aria-hidden
                  />
                ) : (
                  getFileIcon(material.fileKey)
                )}
                <MaterialNameLines primary={label.primary} secondary={label.secondary} />
              </span>
              {canPreview && <Eye size={18} className={styles.viewHint} aria-hidden />}
            </>
          );

          return (
            <div
              key={material.materialId}
              className={canActivate ? `${styles.materialItem} ${styles.materialItemInteractive}` : styles.materialItem}
            >
              {canActivate ? (
                <button
                  type="button"
                  className={styles.rowButton}
                  onClick={openMaterial}
                  aria-label={rowLabel}
                  aria-current={isActiveTrack ? 'true' : undefined}
                >
                  {rowBody}
                </button>
              ) : (
                <div className={styles.rowButton}>{rowBody}</div>
              )}
              {isAudio && onPlayMaterial && (
                <div className={styles.actions}>
                  {favoriteMaterialIds && onToggleFavorite && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(material.materialId, material);
                      }}
                      className={styles.actionButton}
                      aria-label={
                        favoriteMaterialIds.includes(material.materialId)
                          ? `Ta bort ${displayName} från favoriter`
                          : `Lägg till ${displayName} i favoriter`
                      }
                      aria-pressed={favoriteMaterialIds.includes(material.materialId)}
                    >
                      <Heart
                        size={22}
                        fill={
                          favoriteMaterialIds.includes(material.materialId)
                            ? 'currentColor'
                            : 'none'
                        }
                      />
                    </button>
                  )}
                  {onOpenAddToPlaylist && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAddToPlaylist(material.materialId);
                      }}
                      className={styles.actionButton}
                      aria-label={`Lägg till ${displayName} i spellista`}
                    >
                      <ListPlus size={22} aria-hidden />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

// --- Huvudkomponent ---
export const MemberRepertoireMaterialPage = () => {
  const { getAuthHeaders } = useAuth();
  const { favoriteMaterialIds, toggleFavoriteOptimistic } = useFavorites();
  const {
    open: openMusicOverlay,
    activeMaterialId,
    isPlaying,
    activeGroupName,
    isOpen,
    activeTrack,
    setActiveTrack,
    setActiveMaterialId,
    setIsPlaying,
    setPlaybackProgress,
    setQueueMeta,
  } = useMusicPlayerOverlay();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [playlistModalMaterialId, setPlaylistModalMaterialId] = useState<string | null>(null);

  const { repertoireId, groupName } = useParams<{ repertoireId: string; groupName: string; }>();
  const location = useLocation();
  const rawTitle = typeof location.state?.title === 'string' ? location.state.title : undefined;
  const heading = splitRepertoireHeading(rawTitle);
  const songTitle = rawTitle ? heading.title : undefined;

  const sessionMatchesThisGroup =
    Boolean(groupName?.trim()) && activeGroupName === groupName?.trim();

  const fetchMaterials = useCallback(async () => {
    if (!groupName || !repertoireId) { setIsLoading(false); setError("Kunde inte hitta info."); return; }
    setIsLoading(true);
    setError(null);
    try {
      const url = `${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`;
      const response = await axios.get(url, { headers: { ...getAuthHeaders() } });
      setMaterials(response.data);
    } catch (err) {
      setError("Kunde inte hämta materialet.");
    } finally {
      setIsLoading(false);
    }
  }, [groupName, repertoireId, getAuthHeaders]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const visibleMaterials = useMemo(
    () => materials.filter((m) => m.fileKey && !isHiddenSystemFile(m)),
    [materials]
  );

  const audioFiles = useMemo(
    () => visibleMaterials.filter((m) => isPlayableAudioFile(m.fileKey)),
    [visibleMaterials]
  );

  const handlePlayAudioMaterial = useCallback(
    (material: Material) => {
      const g = groupName?.trim();
      const rep = repertoireId?.trim();
      const materialId = material.materialId?.trim();
      if (!g || !rep || !materialId) return;
      if (!material.fileKey || !isPlayableAudioFile(material.fileKey)) return;
      const keepMinimized = !isOpen && Boolean(activeTrack) && activeGroupName === g;
      /** repertoarId från URL; spelaren hämtar material — libraryQueueMaterials används inte. */
      openMusicOverlay(g, 'member', {
        initialRepertoireId: rep,
        repertoirePlayback: { type: 'fromMaterialId', materialId },
        ...(keepMinimized ? { startMinimized: true } : {}),
      });
      if (!keepMinimized) return;

      const title =
        materialLabelText(displayMaterialLabel(material, songTitle)) || '—';
      setActiveMaterialId(materialId);
      setActiveTrack({ title, fileKey: material.fileKey });
      setIsPlaying(true);
      setPlaybackProgress({ current: 0, duration: 0 });
      const queueIndex = audioFiles.findIndex((item) => item.materialId === materialId);
      if (queueIndex >= 0) {
        setQueueMeta({ currentIndex: queueIndex, total: audioFiles.length });
      }
    },
    [
      groupName,
      repertoireId,
      openMusicOverlay,
      isOpen,
      activeTrack,
      activeGroupName,
      audioFiles,
      setActiveMaterialId,
      setActiveTrack,
      setIsPlaying,
      setPlaybackProgress,
      setQueueMeta,
      songTitle,
    ]
  );

  const groupedMaterials = useMemo(() => {
    const buckets: Record<MemberMaterialSection, LabeledMaterial[]> = {
      stems: [],
      video: [],
      scores: [],
      other: [],
    };
    for (const material of visibleMaterials) {
      const label = displayMaterialLabel(material, songTitle);
      const section = memberMaterialSection(material.fileKey, label.sortRank);
      buckets[section].push({ material, label });
    }
    (Object.keys(buckets) as MemberMaterialSection[]).forEach((section) => {
      buckets[section].sort((a, b) => compareMaterialLabels(a.label, b.label));
    });
    return buckets;
  }, [visibleMaterials, songTitle]);

  return (
    <div className={styles.page}>
      <Link to={`/user/me/${groupName}/repertoires`} className={styles.backLink}>
        <ArrowLeft size={16} />
        <span>Tillbaka till repertoar</span>
      </Link>

      <header className={styles.header}>
        <h1 className={styles.repertoireTitle}>{washShoutedText(heading.title)}</h1>
        {heading.artist ? <p className={styles.repertoireArtist}>{washShoutedText(heading.artist)}</p> : null}
      </header>

      {isLoading && <p>Laddar material...</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!isLoading && !error && visibleMaterials.length === 0 && <p>Inget material hittades för denna låt.</p>}

      {!isLoading && !error && visibleMaterials.length > 0 && (
        <div className={styles.sectionsContainer}>
          <MaterialSection
            title="🎧 Stämmor"
            files={groupedMaterials.stems}
            onPlayMaterial={handlePlayAudioMaterial}
            onView={setSelectedMaterial}
            activeMaterialId={sessionMatchesThisGroup ? activeMaterialId : null}
            isPlaying={sessionMatchesThisGroup ? isPlaying : false}
            favoriteMaterialIds={favoriteMaterialIds}
            onToggleFavorite={toggleFavoriteOptimistic}
            onOpenAddToPlaylist={(id) => setPlaylistModalMaterialId(id)}
          />
          <MaterialSection title="🎬 Notfilmer & Video" files={groupedMaterials.video} onView={setSelectedMaterial} />
          <MaterialSection title="📄 Texter" files={groupedMaterials.scores} onView={setSelectedMaterial} />
          <MaterialSection
            title="🥁 Rytmik & Övrigt"
            files={groupedMaterials.other}
            onPlayMaterial={handlePlayAudioMaterial}
            onView={setSelectedMaterial}
            activeMaterialId={sessionMatchesThisGroup ? activeMaterialId : null}
            isPlaying={sessionMatchesThisGroup ? isPlaying : false}
            favoriteMaterialIds={favoriteMaterialIds}
            onToggleFavorite={toggleFavoriteOptimistic}
            onOpenAddToPlaylist={(id) => setPlaylistModalMaterialId(id)}
          />
        </div>
      )}
      <MediaModal isOpen={!!selectedMaterial} onClose={() => setSelectedMaterial(null)} material={selectedMaterial} />
      <AddToPlaylistModal
        isOpen={!!playlistModalMaterialId}
        onClose={() => setPlaylistModalMaterialId(null)}
        materialId={playlistModalMaterialId}
      />
    </div>
  );
};
