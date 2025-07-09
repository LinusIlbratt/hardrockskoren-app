import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import type { Material } from '@/types';
import { MediaModal } from '@/components/ui/modal/MediaModal';
import { MediaPlayer } from '@/components/media/MediaPlayer';
import styles from './PracticePage.module.scss';
import { FileText, Music, Video, Download, PlayCircle, Eye } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const S3_PUBLIC_URL = import.meta.env.VITE_S3_BUCKET_URL;

// --- ÅTERANVÄNDBAR KOMPONENT FÖR KATEGORIER ---
interface MaterialCategoryProps {
  title: string;
  files: Material[];
  onPlay: (file: { url: string; title: string }) => void;
  onView: (material: Material) => void;
}

const MaterialCategory: React.FC<MaterialCategoryProps> = ({ title, files, onPlay, onView }) => {
  if (files.length === 0) return null;

  const getFileIcon = (fileKey: string = '') => {
    const key = fileKey.toLowerCase();
    if (key.match(/\.(mp3|wav|m4a)$/)) return <Music size={20} className={styles.fileIcon} />;
    if (key.match(/\.(mp4|mov|webm)$/)) return <Video size={20} className={styles.fileIcon} />;
    if (key.match(/\.(pdf|txt)$/)) return <FileText size={20} className={styles.fileIcon} />;
    return <Download size={20} className={styles.fileIcon} />;
  };

  const isPlayableAudio = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(mp3|wav|m4a)$/);
  const isViewable = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(pdf|txt|mp4|mov|webm)$/);

  return (
    <section className={styles.categorySection}>
      <h3 className={styles.categoryTitle}>{title}</h3>
      <div className={styles.materialList}>
        {files.map(material => {
          if (!material.fileKey) return null;
          const displayName = material.title || material.fileKey.split('/').pop() || 'Okänd titel';
          const fullUrl = `${S3_PUBLIC_URL}/${material.fileKey}`;

          return (
            <div key={material.materialId} className={styles.materialItem}>
              <div className={styles.itemInfo}>
                {getFileIcon(material.fileKey)}
                <span className={styles.materialTitle}>{displayName}</span>
              </div>
              <div className={styles.actions}>
                {isPlayableAudio(material.fileKey) && (
                  <button onClick={() => onPlay({ url: fullUrl, title: displayName })} className={`${styles.actionButton} ${styles.playButton}`} aria-label={`Spela ${displayName}`}>
                    <PlayCircle size={30} />
                  </button>
                )}
                {isViewable(material.fileKey) && !isPlayableAudio(material.fileKey) && (
                  <button onClick={() => onView(material)} className={`${styles.actionButton} ${styles.viewButton}`} aria-label={`Visa ${displayName}`}>
                    <Eye size={30} />
                  </button>
                )}
                 {!isPlayableAudio(material.fileKey) && !isViewable(material.fileKey) && (
                  <a href={fullUrl} target="_blank" rel="noopener noreferrer" className={styles.actionButton} aria-label={`Ladda ner ${displayName}`}>
                    <Download size={22} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};


// --- HUVUDKOMPONENT ---
export const PracticePage = () => {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nowPlaying, setNowPlaying] = useState<{ url: string; title: string; } | null>(null);
    const [materialToView, setMaterialToView] = useState<Material | null>(null);

    const fetchMaterials = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const token = localStorage.getItem('authToken');
        if (!token) {
            setError("Du måste vara inloggad för att se detta material.");
            setIsLoading(false);
            return;
        }
        try {
            const response = await axios.get(`${API_BASE_URL}/practice/materials`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMaterials(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            setError('Kunde inte hämta övningsmaterial. Försök igen senare.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMaterials();
    }, [fetchMaterials]);

    const { audioFiles, videoFiles, documentFiles, otherFiles } = useMemo(() => {
        const isAudio = (key = '') => key.toLowerCase().match(/\.(mp3|wav|m4a)$/i);
        const isVideo = (key = '') => key.toLowerCase().match(/\.(mp4|mov|webm)$/i);
        const isDocument = (key = '') => key.toLowerCase().match(/\.(pdf|txt|doc|docx)$/i);

        return {
            audioFiles: materials.filter(m => isAudio(m.fileKey)),
            videoFiles: materials.filter(m => isVideo(m.fileKey)),
            documentFiles: materials.filter(m => isDocument(m.fileKey)),
            otherFiles: materials.filter(m => !isAudio(m.fileKey) && !isVideo(m.fileKey) && !isDocument(m.fileKey)),
        };
    }, [materials]);

    if (isLoading) {
        return <div className={styles.page}><p>Laddar övningar...</p></div>;
    }

    if (error) {
        return <div className={styles.page}><p className={styles.errorMessage}>{error}</p></div>;
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <h2>Sjung upp</h2>
                <p>Här hittar du allt övningsmaterial.</p>
            </header>

            {materials.length > 0 ? (
                <div className={styles.sectionsContainer}>
                    <MaterialCategory title="Ljudfiler" files={audioFiles} onPlay={setNowPlaying} onView={setMaterialToView} />
                    <MaterialCategory title="Videor" files={videoFiles} onPlay={setNowPlaying} onView={setMaterialToView} />
                    <MaterialCategory title="Dokument & Texter" files={documentFiles} onPlay={setNowPlaying} onView={setMaterialToView} />
                    <MaterialCategory title="Övrigt" files={otherFiles} onPlay={setNowPlaying} onView={setMaterialToView} />
                </div>
            ) : (
                <p>Det finns inget Sjungupp-material uppladdat ännu.</p>
            )}

            {nowPlaying && (
                <MediaPlayer
                    key={nowPlaying.url}
                    src={nowPlaying.url}
                    title={nowPlaying.title}
                />
            )}

            {materialToView && (
                <MediaModal
                    isOpen={!!materialToView}
                    onClose={() => setMaterialToView(null)}
                    material={materialToView}
                />
            )}
        </div>
    );
};
