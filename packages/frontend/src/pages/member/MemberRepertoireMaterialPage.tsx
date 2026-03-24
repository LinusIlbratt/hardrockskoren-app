import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { MediaModal } from '@/components/ui/modal/MediaModal';
import {
  FileText,
  Music,
  Video,
  Play,
  Volume2,
  Eye,
  ArrowLeft,
  Heart,
  ListPlus,
  Info,
} from 'lucide-react';
import axios from 'axios';
import styles from './MemberRepertoireMaterialPage.module.scss';
import type { Material } from '@/types/index';
import { useAuth } from '@/context/AuthContext';
import { useMusicPlayerOverlay } from '@/context/MusicPlayerOverlayContext';
import {
  getMaterialFileCategory,
  isModalPreviewableFile,
  isPlayableAudioFile,
} from '@/utils/media';
import { useFavorites } from '@/hooks/useFavorites';
import { AddToPlaylistModal } from '@/components/music/AddToPlaylistModal';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

interface MaterialSectionProps {
  title: string;
  files: Material[];
  /** Spela via musik-overlay: initialRepertoireId + repertoirePlayback (ingen libraryQueueMaterials). */
  onPlayMaterial?: (material: Material) => void;
  onView: (material: Material) => void;
  /** Markerar rad som aktiv i den globala spelaren (samma grupp). */
  activeMaterialId?: string | null;
  isPlaying?: boolean;
  /** När satt: visar favorit-knapp för spelbara ljudfiler i listan */
  favoriteMaterialIds?: string[];
  onToggleFavorite?: (materialId: string) => void;
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
    if (cat === 'audio') return <Music size={20} className={styles.fileIcon} />;
    if (cat === 'video') return <Video size={20} className={styles.fileIcon} />;
    if (cat === 'document') return <FileText size={20} className={styles.fileIcon} />;
    return <FileText size={20} className={styles.fileIcon} />;
  };

  return (
    <section className={styles.materialSection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.materialList}>
        {files.map(material => {
          if (!material.fileKey) return null;
          const displayName = material.title || material.fileKey.split('/').pop() || 'Okänd titel';

          return (
            <div key={material.materialId} className={styles.materialItem}>
              <div className={styles.itemInfo}>
                {getFileIcon(material.fileKey)}
                <span className={styles.displayName}>{displayName}</span>
              </div>
              <div className={styles.actions}>
                {isPlayableAudioFile(material.fileKey) && onPlayMaterial && (
                  <span
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {favoriteMaterialIds && onToggleFavorite && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(material.materialId);
                        }}
                        className={`${styles.actionButton} ${styles.playButton}`}
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
                        className={`${styles.actionButton} ${styles.playButton}`}
                        aria-label={`Lägg till ${displayName} i spellista`}
                      >
                        <ListPlus size={22} aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlayMaterial(material);
                      }}
                      className={`${styles.actionButton} ${styles.playButton} ${
                        activeMaterialId === material.materialId ? styles.playButtonActive : ''
                      }`}
                      aria-label={
                        activeMaterialId === material.materialId
                          ? `Spelas nu: ${displayName}. Öppna musikspelaren`
                          : `Spela ${displayName}`
                      }
                      aria-current={
                        activeMaterialId === material.materialId ? 'true' : undefined
                      }
                    >
                      {activeMaterialId === material.materialId ? (
                        <Volume2
                          size={22}
                          strokeWidth={2}
                          className={isPlaying ? styles.playIconPulse : undefined}
                          aria-hidden
                        />
                      ) : (
                        <Play size={22} strokeWidth={2} aria-hidden />
                      )}
                    </button>
                  </span>
                )}
                {isModalPreviewableFile(material.fileKey) && !isPlayableAudioFile(material.fileKey) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onView({ ...material, title: displayName });
                    }}
                    className={`${styles.actionButton} ${styles.viewButton}`}
                    aria-label={`Visa ${displayName}`}
                  >
                    <Eye size={22} aria-hidden />
                  </button>
                )}
                {/* ✅ ÄNDRING: Nedladdningslänken är nu helt borttagen */}
              </div>
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
  const { open: openMusicOverlay, activeMaterialId, isPlaying, activeGroupName } =
    useMusicPlayerOverlay();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [playlistModalMaterialId, setPlaylistModalMaterialId] = useState<string | null>(null);

  const { repertoireId, groupName } = useParams<{ repertoireId: string; groupName: string; }>();
  const location = useLocation();
  const title = location.state?.title;

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

  const audioFiles = useMemo(
    () => materials.filter((m) => m.fileKey && isPlayableAudioFile(m.fileKey)),
    [materials]
  );

  const handlePlayAudioMaterial = useCallback(
    (material: Material) => {
      const g = groupName?.trim();
      const rep = repertoireId?.trim();
      if (!g || !rep || !material.materialId?.trim()) return;
      if (!material.fileKey || !isPlayableAudioFile(material.fileKey)) return;
      /** repertoarId från URL; spelaren hämtar material — libraryQueueMaterials används inte. */
      openMusicOverlay(g, 'member', {
        initialRepertoireId: rep,
        repertoirePlayback: { type: 'fromMaterialId', materialId: material.materialId.trim() },
      });
    },
    [groupName, repertoireId, openMusicOverlay]
  );

  const documentFiles = useMemo(
    () => materials.filter((m) => m.fileKey && getMaterialFileCategory(m.fileKey) === 'document'),
    [materials]
  );
  const videoFiles = useMemo(
    () => materials.filter((m) => m.fileKey && getMaterialFileCategory(m.fileKey) === 'video'),
    [materials]
  );
  const otherFiles = useMemo(
    () =>
      materials.filter(
        (m) => m.fileKey && !audioFiles.includes(m) && !documentFiles.includes(m) && !videoFiles.includes(m)
      ),
    [materials, audioFiles, documentFiles, videoFiles]
  );

  return (
    <div className={styles.page}>
      <Link to={`/user/me/${groupName}/repertoires`} className={styles.backLink}>
        <ArrowLeft size={16} />
        <span>Tillbaka till repertoar</span>
      </Link>
      <div className={styles.legend}>
        <Info size={20} className={styles.legendIcon} aria-hidden />
        <p className={styles.legendText}>
          Tryck på ikonerna{' '}
          <Eye size={18} className={styles.inlineIcon} aria-hidden />{' '}
          <Play size={18} className={styles.inlinePlayIcon} aria-hidden /> för att öppna respektive
          spela upp (öppnar musikspelaren).
        </p>
      </div>

      <header className={styles.header}>
        <h1 className={styles.repertoireTitle}>{title || 'Material'}</h1>
      </header>

      {isLoading && <p>Laddar material...</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!isLoading && !error && materials.length === 0 && <p>Inget material hittades för denna låt.</p>}

      {!isLoading && !error && (
        <div className={styles.sectionsContainer}>
          <MaterialSection title="Noter & Texter" files={documentFiles} onView={setSelectedMaterial} />
          <MaterialSection
            title="Ljudfiler"
            files={audioFiles}
            onPlayMaterial={handlePlayAudioMaterial}
            onView={setSelectedMaterial}
            activeMaterialId={sessionMatchesThisGroup ? activeMaterialId : null}
            isPlaying={sessionMatchesThisGroup ? isPlaying : false}
            favoriteMaterialIds={favoriteMaterialIds}
            onToggleFavorite={toggleFavoriteOptimistic}
            onOpenAddToPlaylist={(id) => setPlaylistModalMaterialId(id)}
          />
          <MaterialSection title="Videor" files={videoFiles} onView={setSelectedMaterial} />
          <MaterialSection title="Övrigt" files={otherFiles} onView={setSelectedMaterial} />
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
