// src/pages/member/MemberRepertoireMaterialPage.tsx

import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { MediaModal } from '@/components/ui/modal/MediaModal';
import axios from 'axios';
import styles from './MemberRepertoireMaterialPage.module.scss';
import type { Material } from '@/types/index';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const FILE_BASE_URL = import.meta.env.VITE_S3_BUCKET_URL;

export const MemberRepertoireMaterialPage = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowPlayingUrl, setNowPlayingUrl] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const { repertoireId } = useParams<{ repertoireId: string }>();
  const { user } = useAuth();

  const fetchMaterials = useCallback(async () => {
    // ... (denna funktion är oförändrad)
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

  return (
    <div className={styles.container}>
      <Link to=".." className={styles.backLink}> &larr; Tillbaka till repertoaren </Link>
      <h1>Material</h1>
      
      {(() => {
        if (isLoading) return <p>Laddar material...</p>;
        if (error) return <p className={styles.error}>{error}</p>;
        if (materials.length === 0) return <p>Inget material hittades för denna låt.</p>;

        return (
          <ul className={styles.materialList}>
            {materials.map(material => {
              // Säkerställ att vi har en fileKey att arbeta med
              if (!material.fileKey) return null;

              const fullUrl = `${FILE_BASE_URL}/${material.fileKey}`;
              
              // --- HÄR ÄR DEN NYA, ROBUSTA LOGIKEN ---
              // 1. Använd fileKey för att ALLTID korrekt identifiera filtypen
              const normalizedFileKey = material.fileKey.toLowerCase();
              const isAudio = normalizedFileKey.endsWith('.mp3') || normalizedFileKey.endsWith('.wav') || normalizedFileKey.endsWith('.m4a');
              const isViewable = normalizedFileKey.endsWith('.pdf') || normalizedFileKey.endsWith('.txt');

              // 2. Skapa ett visningsnamn. Använd 'title' om det finns, annars filnamnet från 'fileKey'.
              const displayName = material.title || material.fileKey.split('/').pop();

              return (
                <li key={material.materialId} className={styles.materialItem}>
                  {isAudio ? (
                    <button onClick={() => setNowPlayingUrl(fullUrl)} className={styles.playButton}>
                      Spela {displayName}
                    </button>
                  ) : isViewable ? (
                    // Skicka med ett anpassat objekt till modalen som alltid har en titel
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
      })()}

      {nowPlayingUrl && (
        <div className={styles.playerContainer}>
          <audio controls autoPlay src={nowPlayingUrl} key={nowPlayingUrl} />
        </div>
      )}

      <MediaModal 
        isOpen={!!selectedMaterial} 
        onClose={() => setSelectedMaterial(null)}
        material={selectedMaterial}
      />
    </div>
  );
};