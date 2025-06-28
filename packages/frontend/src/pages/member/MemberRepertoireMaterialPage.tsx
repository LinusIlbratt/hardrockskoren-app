// src/pages/member/MemberRepertoireMaterialPage.tsx

import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { MediaModal } from '@/components/ui/modal/MediaModal';
import { MediaPlayer } from '@/components/media/MediaPlayer';
import axios from 'axios';
import styles from './MemberRepertoireMaterialPage.module.scss';
import type { Material } from '@/types/index';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const FILE_BASE_URL = import.meta.env.VITE_S3_BUCKET_URL;

export const MemberRepertoireMaterialPage = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowPlaying, setNowPlaying] = useState<{ url: string; title: string; } | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const { repertoireId } = useParams<{ repertoireId: string }>();
  const { user } = useAuth();

  // Datahämtningen är oförändrad
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

  // --- ÄNDRING 1: Filtrera material-listan INNAN vi renderar ---
  // Vi gör detta direkt i komponenten så att det alltid är uppdaterat.
  
  // Funktioner för att identifiera filtyper
  const isAudioFile = (fileKey: string = '') => {
    const normalized = fileKey.toLowerCase();
    return normalized.endsWith('.mp3') || normalized.endsWith('.wav') || normalized.endsWith('.m4a');
  };

  const isDocumentFile = (fileKey: string = '') => {
    const normalized = fileKey.toLowerCase();
    return normalized.endsWith('.pdf') || normalized.endsWith('.txt');
  };

  // Skapa de nya, filtrerade arrayerna
  const audioFiles = materials.filter(m => isAudioFile(m.fileKey));
  const documentFiles = materials.filter(m => isDocumentFile(m.fileKey));
  // Samla alla övriga filer i en egen lista
  const otherFiles = materials.filter(m => !isAudioFile(m.fileKey) && !isDocumentFile(m.fileKey));


  // --- ÄNDRING 2: Skapa en återanvändbar funktion för att rendera en lista ---
  // Detta är för att undvika att upprepa kod (DRY - Don't Repeat Yourself)
  const renderMaterialList = (files: Material[]) => {
    return (
      <ul className={styles.materialList}>
        {files.map(material => {
          if (!material.fileKey) return null;
          const fullUrl = `${FILE_BASE_URL}/${material.fileKey}`;
          const displayName = material.title || material.fileKey.split('/').pop() || 'Okänd titel';

          return (
            <li key={material.materialId} className={styles.materialItem}>
              {isAudioFile(material.fileKey) ? (
                <button onClick={() => setNowPlaying({ url: fullUrl, title: displayName })} className={styles.playButton}>
                  Spela {displayName}
                </button>
              ) : isDocumentFile(material.fileKey) ? (
                <button onClick={() => setSelectedMaterial({ ...material, title: displayName })} className={styles.viewButton}>
                  Visa {displayName}
                </button>
              ) : (
                <a href={fullUrl} target="_blank" rel="noopener noreferrer">
                  Öppna {displayName}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className={styles.container}>      
      <h1>Material</h1>
      {(() => {
        if (isLoading) return <p>Laddar material...</p>;
        if (error) return <p className={styles.error}>{error}</p>;
        if (materials.length === 0) return <p>Inget material hittades för denna låt.</p>;

        // --- ÄNDRING 3: Ny renderingslogik med sektioner ---
        return (
          <>
            {audioFiles.length > 0 && (
              <section className={styles.materialSection}>
                <h2>Ljudfiler</h2>
                {renderMaterialList(audioFiles)}
              </section>
            )}

            {documentFiles.length > 0 && (
              <section className={styles.materialSection}>
                <h2>Dokument & Noter</h2>
                {renderMaterialList(documentFiles)}
              </section>
            )}
            
            {otherFiles.length > 0 && (
              <section className={styles.materialSection}>
                <h2>Övrigt</h2>
                {renderMaterialList(otherFiles)}
              </section>
            )}
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