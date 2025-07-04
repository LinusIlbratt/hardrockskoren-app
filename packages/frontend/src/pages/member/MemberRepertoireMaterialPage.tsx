// src/pages/member/MemberRepertoireMaterialPage.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { MediaModal } from '@/components/ui/modal/MediaModal';
import { MediaPlayer } from '@/components/media/MediaPlayer';
import { FaPlayCircle } from "react-icons/fa";
import { IoEyeOutline } from "react-icons/io5";
import axios from 'axios';
import styles from './MemberRepertoireMaterialPage.module.scss';
import type { Material } from '@/types/index';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const FILE_BASE_URL = import.meta.env.VITE_S3_BUCKET_URL;

// --- ÅTERANVÄNDBAR KOMPONENT (UPPDATERAD) ---
interface MaterialSectionProps {
  title: string;
  files: Material[];
  onPlay: (file: { url: string; title: string }) => void;
  onView: (material: Material) => void;
}

const MaterialSection: React.FC<MaterialSectionProps> = ({ title, files, onPlay, onView }) => {
  if (files.length === 0) {
    return null;
  }

  const isAudioFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(mp3|wav|m4a)$/);
  const isVideoFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(mp4|mov|webm|avi)$/);
  const isDocumentFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(pdf|txt)$/);

  return (
    <section className={styles.materialSection}>
      <h2>{title}</h2>
      <ul className={styles.materialList}>
        {files.map(material => {
          if (!material.fileKey) return null;
          const fullUrl = `${FILE_BASE_URL}/${material.fileKey}`;
          const displayName = material.title || material.fileKey.split('/').pop() || 'Okänd titel';

          return (
            <li key={material.materialId} className={styles.materialItem}>
              <span className={styles.displayName}>{displayName}</span>
              <div className={styles.actions}>
                {isAudioFile(material.fileKey) && (
                  <button onClick={() => onPlay({ url: fullUrl, title: displayName })} className={styles.iconPlay} aria-label={`Spela ${displayName}`}>
                    <FaPlayCircle size={22} />
                  </button>
                )}
                {/* NYTT: Hantering för videofiler */}
                {isVideoFile(material.fileKey) && (
                  <button onClick={() => onView({ ...material, title: displayName })} className={styles.iconPlay} aria-label={`Visa video ${displayName}`}>
                     <FaPlayCircle size={22} />
                  </button>
                )}
                {isDocumentFile(material.fileKey) && (
                  <button onClick={() => onView({ ...material, title: displayName })} className={styles.iconView} aria-label={`Visa ${displayName}`}>
                    <IoEyeOutline size={24} />
                  </button>
                )}
                {!isAudioFile(material.fileKey) && !isVideoFile(material.fileKey) && !isDocumentFile(material.fileKey) && (
                  <a href={fullUrl} target="_blank" rel="noopener noreferrer" className={styles.iconView} aria-label={`Öppna ${displayName}`}>
                    <IoEyeOutline size={24} />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};


// --- HUVUDKOMPONENT ---
export const MemberRepertoireMaterialPage = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{ url: string; title: string; } | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const { repertoireId } = useParams<{ repertoireId: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const title = location.state?.title;

  // Datahämtning är oförändrad
  const fetchMaterials = useCallback(async () => {
    const userGroup = user?.groups?.[0];
    if (!userGroup || !repertoireId) { setIsLoading(false); setError("Kunde inte hitta info."); return; }
    setIsLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    try {
      const url = `${API_BASE_URL}/groups/${userGroup}/repertoires/${repertoireId}/materials`;
      const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setMaterials(response.data);
    } catch (err) {
      setError("Kunde inte hämta materialet.");
    } finally {
      setIsLoading(false);
    }
  }, [user, repertoireId]);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  // Filtrera material-listan
  const isAudioFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(mp3|wav|m4a)$/);
  const isVideoFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(mp4|mov|webm|avi)$/);
  const isDocumentFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(pdf|txt)$/);
  
  const audioFiles = materials.filter(m => isAudioFile(m.fileKey));
  const documentFiles = materials.filter(m => isDocumentFile(m.fileKey));
  const videoFiles = materials.filter(m => isVideoFile(m.fileKey));
  const otherFiles = materials.filter(m => !isAudioFile(m.fileKey) && !isVideoFile(m.fileKey) && !isDocumentFile(m.fileKey));


  return (
    <div className={styles.container}>      
      <div className={styles.header}>
        <h1 className={styles.repertoireTitle}>{title || 'Material'}</h1>
      </div>

      {(() => {
        if (isLoading) return <p>Laddar material...</p>;
        if (error) return <p className={styles.error}>{error}</p>;
        if (materials.length === 0) return <p>Inget material hittades för denna låt.</p>;

        return (
          <>
          <MaterialSection 
              title="Texter & Noter"
              files={documentFiles}
              onPlay={setNowPlaying}
              onView={setSelectedMaterial}
            />
            <MaterialSection 
              title="Ljudfiler"
              files={audioFiles}
              onPlay={setNowPlaying}
              onView={setSelectedMaterial}
            />
            {/* NYTT: Sektion för videofiler */}
            <MaterialSection 
              title="Videos"
              files={videoFiles}
              onPlay={setNowPlaying}
              onView={setSelectedMaterial}
            />
            <MaterialSection 
              title="Övrigt"
              files={otherFiles}
              onPlay={setNowPlaying}
              onView={setSelectedMaterial}
            />
          </>
        );
      })()}

      {/* Spelare och modal är oförändrade */}
      {nowPlaying && (
        <MediaPlayer 
          key={nowPlaying.url} 
          src={nowPlaying.url}
          title={nowPlaying.title}
        />
      )}
      <MediaModal
          isOpen={!!selectedMaterial}
          onClose={() => setSelectedMaterial(null)}
          material={selectedMaterial}
      />
    </div>
  );
};
