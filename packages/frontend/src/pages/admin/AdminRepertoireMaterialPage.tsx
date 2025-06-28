import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import { IoTrashOutline } from 'react-icons/io5';
import { FaPlayCircle } from "react-icons/fa"; // Ikon för Spela
import { IoEyeOutline } from "react-icons/io5"; // Ikon för Visa
import styles from './AdminRepertoireMaterialPage.module.scss';
import type { Material } from '@/types';
import { MaterialPickerModal } from '@/components/ui/modal/MaterialPickerModal';
import { MediaModal } from '@/components/ui/modal/MediaModal';     // Importera MediaModal
import { MediaPlayer } from '@/components/media/MediaPlayer'; // Importera MediaPlayer

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const FILE_BASE_URL = import.meta.env.VITE_S3_BUCKET_URL;

export const AdminRepertoireMaterialPage = () => {
  const { groupName, repertoireId } = useParams<{ groupName: string; repertoireId: string }>();
  const location = useLocation();
  const repertoireTitle = location.state?.repertoireTitle || "Okänd Låt";

  const [linkedMaterials, setLinkedMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPickerModalOpen, setIsPickerModalOpen] = useState(false); // Bytte namn för tydlighet

  // --- NYA STATES FÖR FÖRHANDSGRANSKNING ---
  const [nowPlaying, setNowPlaying] = useState<{ url: string; title: string; } | null>(null);
  const [materialToView, setMaterialToView] = useState<Material | null>(null);

  const fetchLinkedMaterials = useCallback(async () => {
    if (!groupName || !repertoireId) return;
    setIsLoading(true);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLinkedMaterials(response.data);
    } catch (error) {
      console.error("Failed to fetch linked materials:", error);
    } finally {
      setIsLoading(false);
    }
  }, [groupName, repertoireId]);

  useEffect(() => {
    fetchLinkedMaterials();
  }, [fetchLinkedMaterials]);

  const handleUnlinkMaterial = async (materialId: string) => {
    alert("Funktion för att ta bort koppling är inte implementerad än.");
  };
  
  // Hjälpfunktioner för att identifiera filtyper
  const isAudioFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(mp3|wav|m4a|mp4)$/);
  const isDocumentFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(pdf|txt)$/);

  return (
    <div className={styles.page}>    
      <div className={styles.header}>
        <div>
          <h1 className={styles.repertoireTitle}>{repertoireTitle}</h1>
          
        </div>
        <Button onClick={() => setIsPickerModalOpen(true)}>
          Lägg till från biblioteket
        </Button>
      </div>

      {isLoading ? (
        <p>Laddar material...</p>
      ) : (
        <ul className={styles.materialList}>
          {linkedMaterials.length > 0 ? (
            linkedMaterials.map(material => {
              const fullUrl = `${FILE_BASE_URL}/${material.fileKey}`;
              const displayName = material.title || material.fileKey;

              return (
                <li key={material.materialId} className={styles.materialItem}>
                  <span className={styles.materialTitle}>{displayName}</span>
                  <div className={styles.actions}>
                    {/* --- NYA KNAPPAR FÖR FÖRHANDSGRANSKNING --- */}
                    {isAudioFile(material.fileKey) && (
                      <button onClick={() => setNowPlaying({ url: fullUrl, title: displayName })} className={styles.iconButton} aria-label={`Spela ${displayName}`}>
                        <FaPlayCircle size={22} />
                      </button>
                    )}
                    {isDocumentFile(material.fileKey) && (
                      <button onClick={() => setMaterialToView(material)} className={styles.iconButton} aria-label={`Visa ${displayName}`}>
                        <IoEyeOutline size={24} />
                      </button>
                    )}
                    <button onClick={() => handleUnlinkMaterial(material.materialId)} className={`${styles.iconButton} ${styles.deleteButton}`} aria-label={`Ta bort koppling för ${displayName}`}>
                      <IoTrashOutline size={22} />
                    </button>
                  </div>
                </li>
              );
            })
          ) : (
            <p>Inget material har kopplats till denna låt ännu.</p>
          )}
        </ul>
      )}

      {/* Modal för att välja filer från biblioteket */}
      {isPickerModalOpen && (
        <MaterialPickerModal 
          groupName={groupName!}
          repertoireId={repertoireId!}
          onClose={() => setIsPickerModalOpen(false)} 
          onSave={() => {
            setIsPickerModalOpen(false);
            fetchLinkedMaterials();
          }} 
        />
      )}

      {/* Media-spelare och -modal för förhandsgranskning */}
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