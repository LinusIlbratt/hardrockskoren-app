import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Info } from 'lucide-react';
import { IoEyeOutline } from 'react-icons/io5';
import { FaPlayCircle } from "react-icons/fa";
import { FiFolder, FiMusic, FiFileText, FiFile, FiChevronRight, FiArrowLeft, FiEdit2 } from 'react-icons/fi';
import styles from './AdminRepertoireMaterialPage.module.scss';
import type { Material } from '@/types';
import { MediaModal } from '@/components/media/MediaModal';
import { Modal } from '@/components/ui/modal/Modal';
import {
  useMusicPlayerOverlay,
  type MusicPlayerViewer,
} from '@/context/MusicPlayerOverlayContext';
import { MaterialNameLines } from '@/components/materials/MaterialNameLines';
import { isPlayableAudioFile } from '@/utils/media';
import { updateRepertoireMaterial } from '@/services/materialService';
import {
  compareMaterialLabels,
  displayMaterialLabel,
  materialLabelText,
  parseMaterialLabel,
  VOICE_LABEL_PRESETS,
  washShoutedText,
} from '@/utils/materialLabel';

function splitSongHeading(raw: string | undefined): { songTitle: string; artistName: string } {
  const value = raw?.trim() ?? '';
  const parts = value.split(/\s+-\s+/);
  const artistName = parts.slice(1).join(' - ').trim();
  if (parts.length >= 2 && parts[0]?.trim() && artistName) {
    return { songTitle: parts[0].trim(), artistName };
  }
  return { songTitle: value, artistName: '' };
}

interface FolderItem {
  type: 'folder';
  name: string;
  path: string;
}
interface FileItem { type: 'file'; material: Material; }
type DirectoryItem = FolderItem | FileItem;

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const CUSTOM_VOICE = '__custom__';

function voiceChoiceFromSaved(voiceLabel: string | undefined): { choice: string; custom: string } {
  const saved = voiceLabel?.trim() ?? '';
  if (!saved) return { choice: '', custom: '' };
  if ((VOICE_LABEL_PRESETS as readonly string[]).includes(saved)) {
    return { choice: saved, custom: '' };
  }
  return { choice: CUSTOM_VOICE, custom: saved };
}

function musicViewerFromPathname(pathname: string): MusicPlayerViewer {
  if (pathname.startsWith('/leader/')) return 'leader';
  if (pathname.startsWith('/admin/')) return 'admin';
  return 'member';
}

// --- HJÄLPFUNKTIONER ---
const getIconForFile = (fileName: string = '') => {
  if (/\.(mp3|wav|m4a|ogg)$/i.test(fileName)) return <FiMusic className={styles.itemIcon} />;
  if (/\.(pdf|txt|doc|docx)$/i.test(fileName)) return <FiFileText className={styles.itemIcon} />;
  return <FiFile className={styles.itemIcon} />;
};

const isAudioFile = (fileKey: string = '') => /\.(mp3|wav|m4a|ogg)$/i.test(fileKey);
const isVideoFile = (fileKey: string = '') => /\.(mp4|mov|webm|avi)$/i.test(fileKey);
const isDocumentFile = (fileKey: string = '') => /\.(pdf|txt|doc|docx)$/i.test(fileKey);

function labelForDirectoryItem(item: DirectoryItem, songTitle: string) {
  if (item.type === 'folder') {
    return parseMaterialLabel({ title: item.name, songTitle });
  }
  return displayMaterialLabel(item.material, songTitle);
}

const parseRepertoireContents = (
  materials: Material[],
  repertoireTitle: string,
  currentSubPath: string,
  songTitle: string,
): DirectoryItem[] => {
  const directoryMap = new Map<string, DirectoryItem>();
  const basePath = repertoireTitle;
  const currentFullPath = currentSubPath ? `${basePath}/${currentSubPath}` : basePath;
  const currentPathPrefix = `${currentFullPath}/`;

  materials.forEach(material => {
    const path = material.filePath || material.fileKey || '';
    if (!path || !path.startsWith(currentPathPrefix)) {
      return;
    }
    const relativePath = path.substring(currentPathPrefix.length);
    if (!relativePath) {
      return;
    }
    const pathParts = relativePath.split('/');

    if (pathParts.length > 1) {
      const subFolderName = pathParts[0];
      if (subFolderName === '.DS_Store') {
        return;
      }
      if (!directoryMap.has(subFolderName)) {
        directoryMap.set(subFolderName, {
          type: 'folder',
          name: subFolderName,
          path: `${currentSubPath ? `${currentSubPath}/` : ''}${subFolderName}`,
        });
      }
    } else {
      const fileName = pathParts[0];
      if (fileName === '.DS_Store') {
        return;
      }
      if (!directoryMap.has(fileName)) {
        directoryMap.set(fileName, { type: 'file', material });
      }
    }
  });

  return Array.from(directoryMap.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return compareMaterialLabels(
      labelForDirectoryItem(a, songTitle),
      labelForDirectoryItem(b, songTitle),
    );
  });
};


export const AdminRepertoireMaterialPage = () => {
  const { groupName, repertoireId } = useParams<{ groupName: string; repertoireId: string }>();
  const splat = useParams()['*'];
  const location = useLocation();
  const navigate = useNavigate();
  const { open: openMusicOverlay, activeMaterialId, isPlaying, activeGroupName } =
    useMusicPlayerOverlay();
  const viewer = musicViewerFromPathname(location.pathname);
  
  const [title, setTitle] = useState(location.state?.repertoireTitle);
  const [linkedMaterials, setLinkedMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [materialToView, setMaterialToView] = useState<Material | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [labelEdit, setLabelEdit] = useState<{
    material: Material;
    voiceChoice: string;
    customVoice: string;
    songTitle: string;
  } | null>(null);
  const [labelSaving, setLabelSaving] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const canEditLabels = viewer === 'admin' || viewer === 'leader';

  const sessionMatchesThisGroup =
    Boolean(groupName?.trim()) && activeGroupName === groupName?.trim();
  
  const fetchLinkedMaterials = useCallback(async () => {
    if (!groupName || !repertoireId) return;
    setIsLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLinkedMaterials(response.data);
    } catch (error) {
      console.error("Failed to fetch linked materials:", error);
      setError("Kunde inte ladda materialet.");
    } finally {
      setIsLoading(false);
    }
  }, [groupName, repertoireId]);

  useEffect(() => {
    const fetchRepertoireDetailsIfNeeded = async () => {
      if (title) return;
      
      const token = localStorage.getItem('authToken');
      try {
        const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTitle(response.data.title);
      } catch (err) {
        console.error("Failed to fetch repertoire details:", err);
        setError("Information om låten saknas. Gå tillbaka till repertoarlistan.");
        setIsLoading(false);
      }
    };
    
    fetchRepertoireDetailsIfNeeded();

    if (title) {
        fetchLinkedMaterials();
    }
  }, [groupName, repertoireId, title, fetchLinkedMaterials]);

  const decodedSubPath = useMemo(() => splat ? decodeURIComponent(splat) : '', [splat]);
  const repertoireSongTitle = splitSongHeading(title).songTitle;
  const directoryItems = useMemo(
    () => parseRepertoireContents(linkedMaterials, title || '', decodedSubPath, repertoireSongTitle),
    [linkedMaterials, title, decodedSubPath, repertoireSongTitle]
  );
  
  const breadcrumbs = useMemo(() => decodedSubPath.split('/').filter(p => p), [decodedSubPath]);
  const currentTitle = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : title;
  const heading = splitSongHeading(currentTitle);
  const songTitle = washShoutedText(heading.songTitle);
  const artistName = washShoutedText(heading.artistName);

  const handlePlayMaterial = useCallback(
    (material: Material) => {
      const g = groupName?.trim();
      const rep = repertoireId?.trim();
      if (!g || !rep || !material.materialId?.trim()) return;
      if (!material.fileKey || !isPlayableAudioFile(material.fileKey)) return;
      openMusicOverlay(g, viewer, {
        initialRepertoireId: rep,
        repertoirePlayback: { type: 'fromMaterialId', materialId: material.materialId.trim() },
        startMinimized: true,
      });
    },
    [groupName, repertoireId, viewer, openMusicOverlay]
  );

  const openLabelEdit = (material: Material) => {
    const voice = voiceChoiceFromSaved(material.voiceLabel);
    setLabelError(null);
    setLabelEdit({
      material,
      voiceChoice: voice.choice,
      customVoice: voice.custom,
      songTitle: material.songTitle?.trim() ?? '',
    });
  };

  const saveLabelEdit = async () => {
    if (!labelEdit || !groupName || !repertoireId || labelSaving) return;
    const voiceLabel = labelEdit.voiceChoice === CUSTOM_VOICE
      ? labelEdit.customVoice.trim()
      : labelEdit.voiceChoice.trim();
    if (labelEdit.voiceChoice === CUSTOM_VOICE && !voiceLabel) {
      setLabelError('Skriv en egen stämma, eller välj en i listan.');
      return;
    }
    const songTitle = labelEdit.songTitle.trim();
    setLabelSaving(true);
    setLabelError(null);
    try {
      const saved = await updateRepertoireMaterial(
        groupName,
        repertoireId,
        labelEdit.material.materialId,
        { voiceLabel, songTitle },
      );
      setLinkedMaterials((prev) => prev.map((item) => {
        if (item.materialId !== saved.materialId) return item;
        const next = { ...item };
        if (saved.voiceLabel) next.voiceLabel = saved.voiceLabel;
        else delete next.voiceLabel;
        if (saved.songTitle) next.songTitle = saved.songTitle;
        else delete next.songTitle;
        return next;
      }));
      setLabelEdit(null);
    } catch (err) {
      const message = axios.isAxiosError(err) ? err.response?.data?.message : null;
      setLabelError(typeof message === 'string' && message.trim() ? message : 'Kunde inte spara.');
    } finally {
      setLabelSaving(false);
    }
  };

  const choirBase = viewer === 'leader'
    ? `/leader/choir/${groupName}`
    : `/admin/groups/${groupName}`;
  const repertoireListPath = `${choirBase}/repertoires`;
  const materialsBase = `${repertoireListPath}/${repertoireId}/materials`;

  const handleSmartBack = () => {
    if (decodedSubPath) {
      const pathParts = decodedSubPath.split('/').filter((part) => part);
      const parentPath = pathParts.slice(0, -1).map(encodeURIComponent).join('/');
      navigate(parentPath ? `${materialsBase}/${parentPath}` : materialsBase, {
        state: { repertoireTitle: title },
      });
      return;
    }
    navigate(repertoireListPath);
  };

  if (isLoading || !title) return <p className={styles.pageState}>Laddar material...</p>;
  if (error) return <p className={`${styles.pageState} ${styles.error}`}>{error}</p>;

  return (
    <div className={styles.page}>
      <div className={styles.navBlock}>
        <button type="button" onClick={handleSmartBack} className={styles.backButton}>
          <FiArrowLeft aria-hidden="true" />
          Tillbaka
        </button>
        <nav className={styles.breadcrumbs} aria-label="Sökväg">
          <Link to={repertoireListPath}>Repertoar</Link>
          <span aria-hidden="true"> / </span>
          <Link to={materialsBase} state={{ repertoireTitle: title }}>{washShoutedText(title)}</Link>
          {breadcrumbs.map((part, index) => {
            const pathSlice = breadcrumbs.slice(0, index + 1);
            const linkPath = pathSlice.map(encodeURIComponent).join('/');
            const crumb = parseMaterialLabel({ title: part, songTitle: repertoireSongTitle }).primary;
            return (
              <span key={linkPath}>
                <span aria-hidden="true"> / </span>
                <Link to={`${materialsBase}/${linkPath}`} state={{ repertoireTitle: title }}>{crumb}</Link>
              </span>
            );
          })}
        </nav>
      </div>
      
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.songTitle}>{songTitle}</h1>
          {artistName ? <p className={styles.artistName}>{artistName}</p> : null}
        </div>
        <button
          type="button"
          className={styles.infoButton}
          onClick={() => setIsHelpOpen(true)}
          aria-label="Så fungerar det"
          aria-expanded={isHelpOpen}
        >
          <Info size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.itemList}>
        {directoryItems.length > 0 ? (
          directoryItems.map(item => {
            const label = labelForDirectoryItem(item, repertoireSongTitle);
            const labelText = materialLabelText(label);
            return item.type === 'folder' ? (
              <Link
                to={`${materialsBase}/${item.path.split('/').map(encodeURIComponent).join('/')}`}
                state={{ repertoireTitle: title }}
                key={item.path}
                className={styles.itemRow}
              >
                <div className={styles.itemInfo}>
                  <FiFolder className={styles.itemIcon} />
                  <MaterialNameLines primary={label.primary} secondary={label.secondary} />
                </div>
                <FiChevronRight className={styles.chevronIcon} />
              </Link>
            ) : (
              <div key={item.material.materialId} className={styles.itemRow}>
                <div className={styles.itemInfo}>
                  {getIconForFile(item.material.filePath || item.material.fileKey)}
                  <MaterialNameLines primary={label.primary} secondary={label.secondary} />
                </div>
                <div className={styles.actions}>
                  {isAudioFile(item.material.fileKey) && (
                    <button
                      onClick={() => handlePlayMaterial(item.material)}
                      title={`Spela upp ${labelText}`}
                      aria-label={`Spela upp ${labelText}`}
                      aria-pressed={
                        sessionMatchesThisGroup &&
                        activeMaterialId === item.material.materialId &&
                        isPlaying
                      }
                    >
                      <FaPlayCircle size={22} />
                    </button>
                  )}
                  {(isDocumentFile(item.material.fileKey) || isVideoFile(item.material.fileKey)) && (
                    <button
                      onClick={() => setMaterialToView(item.material)}
                      className={styles.iconView}
                      title={`Visa ${labelText}`}
                      aria-label={`Visa ${labelText}`}
                    >
                      <IoEyeOutline size={24} />
                    </button>
                  )}
                  {canEditLabels && (
                    <button
                      type="button"
                      onClick={() => openLabelEdit(item.material)}
                      title={`Redigera stämma och låtnamn för ${labelText}`}
                      aria-label={`Redigera stämma och låtnamn för ${labelText}`}
                    >
                      <FiEdit2 size={20} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p>Denna mapp är tom.</p>
        )}
      </div>

      {materialToView && <MediaModal isOpen={!!materialToView} onClose={() => setMaterialToView(null)} material={materialToView} />}

      <Modal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="Så fungerar det"
        tone="luxury"
        size="compact"
      >
        <p className={styles.helpText}>
          Klicka på play-ikonen för att spela upp ljudfiler och ögat för att förhandsvisa videor och dokument.
          Pennan ändrar stämma och låtnamn för den här kören, utan att filen i biblioteket byts ut.
        </p>
      </Modal>

      <Modal
        formMode
        tone="luxury"
        size="compact"
        isOpen={Boolean(labelEdit)}
        onClose={() => {
          if (!labelSaving) setLabelEdit(null);
        }}
        title="Stämma och låtnamn"
      >
        {labelEdit && (
          <form
            className={styles.labelForm}
            onSubmit={(event) => {
              event.preventDefault();
              void saveLabelEdit();
            }}
          >
            <label className={styles.labelField} htmlFor="repertoire-voice-label">
              Stämma
              <select
                id="repertoire-voice-label"
                value={labelEdit.voiceChoice}
                onChange={(event) => {
                  const voiceChoice = event.target.value;
                  setLabelEdit((current) => current ? { ...current, voiceChoice } : current);
                }}
              >
                <option value="">Automatisk, från filnamnet</option>
                {VOICE_LABEL_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
                <option value={CUSTOM_VOICE}>Egen text</option>
              </select>
            </label>
            {labelEdit.voiceChoice === CUSTOM_VOICE && (
              <label className={styles.labelField} htmlFor="repertoire-voice-custom">
                Egen stämma
                <input
                  id="repertoire-voice-custom"
                  type="text"
                  maxLength={60}
                  value={labelEdit.customVoice}
                  onChange={(event) => {
                    const customVoice = event.target.value;
                    setLabelEdit((current) => current ? { ...current, customVoice } : current);
                  }}
                />
              </label>
            )}
            <label className={styles.labelField} htmlFor="repertoire-song-title">
              Låtnamn
              <input
                id="repertoire-song-title"
                type="text"
                maxLength={120}
                value={labelEdit.songTitle}
                placeholder="Lämna tomt för att använda det tolkade namnet"
                onChange={(event) => {
                  const songTitle = event.target.value;
                  setLabelEdit((current) => current ? { ...current, songTitle } : current);
                }}
              />
            </label>
            {labelError ? <p className={styles.labelError}>{labelError}</p> : null}
            <div className={styles.labelActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={labelSaving}
                onClick={() => setLabelEdit(null)}
              >
                Avbryt
              </button>
              <button type="submit" className={styles.primaryButton} disabled={labelSaving}>
                {labelSaving ? 'Sparar…' : 'Spara'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};