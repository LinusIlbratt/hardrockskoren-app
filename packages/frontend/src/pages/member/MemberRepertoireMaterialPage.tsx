import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { MediaModal } from '@/components/ui/modal/MediaModal';
import { MediaPlayer } from '@/components/media/MediaPlayer';
import { FileText, Music, Video, PlayCircle, Eye, ArrowLeft } from 'lucide-react'; // Tog bort Download-ikonen
import axios from 'axios';
import styles from './MemberRepertoireMaterialPage.module.scss';
import type { Material } from '@/types/index';
import { FaPlayCircle } from "react-icons/fa";
import { IoEyeOutline, IoInformationCircleOutline } from 'react-icons/io5';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const FILE_BASE_URL = import.meta.env.VITE_S3_BUCKET_URL;

interface MaterialSectionProps {
  title: string;
  files: Material[];
  onPlay: (file: { url: string; title: string }) => void;
  onView: (material: Material) => void;
}

const MaterialSection: React.FC<MaterialSectionProps> = ({ title, files, onPlay, onView }) => {
  if (files.length === 0) return null;

  const getFileIcon = (fileKey: string = '') => {
    const key = fileKey.toLowerCase();
    if (key.match(/\.(mp3|wav|m4a)$/)) return <Music size={20} className={styles.fileIcon} />;
    if (key.match(/\.(mp4|mov|webm)$/)) return <Video size={20} className={styles.fileIcon} />;
    if (key.match(/\.(pdf|txt)$/)) return <FileText size={20} className={styles.fileIcon} />;
    // Fallback-ikon om filtypen är okänd, men ingen nedladdning erbjuds
    return <FileText size={20} className={styles.fileIcon} />;
  };

  const isPlayableAudio = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(mp3|wav|m4a)$/);
  const isViewable = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(pdf|txt|mp4|mov|webm)$/);

  return (
    <section className={styles.materialSection}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.materialList}>
        {files.map(material => {
          if (!material.fileKey) return null;
          const fullUrl = `${FILE_BASE_URL}/${material.fileKey}`;
          const displayName = material.title || material.fileKey.split('/').pop() || 'Okänd titel';

          return (
            <div key={material.materialId} className={styles.materialItem}>
              <div className={styles.itemInfo}>
                {getFileIcon(material.fileKey)}
                <span className={styles.displayName}>{displayName}</span>
              </div>
              <div className={styles.actions}>
                {isPlayableAudio(material.fileKey) && (
                  <button onClick={() => onPlay({ url: fullUrl, title: displayName })} className={`${styles.actionButton} ${styles.playButton}`} aria-label={`Spela ${displayName}`}>
                    <PlayCircle size={30} />
                  </button>
                )}
                {isViewable(material.fileKey) && !isPlayableAudio(material.fileKey) && (
                  <button onClick={() => onView({ ...material, title: displayName })} className={`${styles.actionButton} ${styles.viewButton}`} aria-label={`Visa ${displayName}`}>
                    <Eye size={30} />
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
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{ url: string; title: string; } | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const { repertoireId, groupName } = useParams<{ repertoireId: string; groupName: string; }>();
  const location = useLocation();
  const title = location.state?.title;

  const fetchMaterials = useCallback(async () => {
    if (!groupName || !repertoireId) { setIsLoading(false); setError("Kunde inte hitta info."); return; }
    setIsLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    try {
      const url = `${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`;
      const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setMaterials(response.data);
    } catch (err) {
      setError("Kunde inte hämta materialet.");
    } finally {
      setIsLoading(false);
    }
  }, [groupName, repertoireId]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const audioFiles = materials.filter(m => m.fileKey?.toLowerCase().match(/\.(mp3|wav|m4a)$/));
  const documentFiles = materials.filter(m => m.fileKey?.toLowerCase().match(/\.(pdf|txt)$/));
  const videoFiles = materials.filter(m => m.fileKey?.toLowerCase().match(/\.(mp4|mov|webm)$/));
  const otherFiles = materials.filter(m => !audioFiles.includes(m) && !documentFiles.includes(m) && !videoFiles.includes(m));

  return (
    <div className={styles.page}>
      <Link to={`/user/me/${groupName}/repertoires`} className={styles.backLink}>
        <ArrowLeft size={16} />
        <span>Tillbaka till repertoar</span>
      </Link>
      <div className={styles.legend}>
        <IoInformationCircleOutline size={20} className={styles.legendIcon} />
        <p className={styles.legendText}>
          Tryck på ikonerna <IoEyeOutline size={20} className={styles.inlineIcon} /><FaPlayCircle size={20} className={styles.inlinePlayIcon} /> för att öppna/spela upp filer.
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
          <MaterialSection title="Noter & Texter" files={documentFiles} onPlay={setNowPlaying} onView={setSelectedMaterial} />
          <MaterialSection title="Ljudfiler" files={audioFiles} onPlay={setNowPlaying} onView={setSelectedMaterial} />
          <MaterialSection title="Videor" files={videoFiles} onPlay={setNowPlaying} onView={setSelectedMaterial} />
          <MaterialSection title="Övrigt" files={otherFiles} onPlay={setNowPlaying} onView={setSelectedMaterial} />
        </div>
      )}

      {nowPlaying && <MediaPlayer key={nowPlaying.url} src={nowPlaying.url} title={nowPlaying.title} />}
      <MediaModal isOpen={!!selectedMaterial} onClose={() => setSelectedMaterial(null)} material={selectedMaterial} />
    </div>
  );
};
