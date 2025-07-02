import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button'; // Antagande att ButtonVariant finns
import { Modal } from '@/components/ui/modal/Modal'; // Antagande att Modal finns
import { IoTrashOutline } from 'react-icons/io5';
import { FaPlayCircle } from "react-icons/fa";
import { IoEyeOutline } from "react-icons/io5";
import styles from './AdminRepertoireMaterialPage.module.scss';
import type { Material } from '@/types';
import { MaterialPickerModal } from '@/components/ui/modal/MaterialPickerModal';
import { MediaModal } from '@/components/ui/modal/MediaModal';
import { MediaPlayer } from '@/components/media/MediaPlayer';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const FILE_BASE_URL = import.meta.env.VITE_S3_BUCKET_URL;

export const AdminRepertoireMaterialPage = () => {
  const { groupName, repertoireId } = useParams<{ groupName: string; repertoireId: string }>();
  const location = useLocation();
  const repertoireTitle = location.state?.repertoireTitle || "Okänd Låt";

  const [linkedMaterials, setLinkedMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPickerModalOpen, setIsPickerModalOpen] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<{ url: string; title: string; } | null>(null);
  const [materialToView, setMaterialToView] = useState<Material | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- STATES FÖR BEKRÄFTELSEMODAL ---
  const [materialToUnlink, setMaterialToUnlink] = useState<Material | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);

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
    fetchLinkedMaterials();
  }, [fetchLinkedMaterials]);

  // --- Funktion för att öppna modalen ---
  const handleUnlinkMaterial = (material: Material) => {
    setMaterialToUnlink(material);
  };

  // --- Funktion som utför raderingen efter bekräftelse ---
  const handleConfirmUnlink = async () => {
    if (!materialToUnlink) return;

    setIsUnlinking(true);
    setError(null);
    const token = localStorage.getItem('authToken');

    try {
      await axios.delete(
        `${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials/${materialToUnlink.materialId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      fetchLinkedMaterials();

    } catch (err) {
      console.error("Failed to unlink material:", err);
      setError("Kopplingen kunde inte tas bort. Försök igen.");
    } finally {
      setIsUnlinking(false);
      setMaterialToUnlink(null);
    }
  };
  
  const isAudioFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(mp3|wav|m4a)$/);
  const isVideoFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(mp4|mov|webm|avi)$/);
  const isDocumentFile = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(pdf|txt)$/);

  // --- NYTT: Filtrera material i kategorier ---
  const documents = linkedMaterials.filter(m => isDocumentFile(m.fileKey));
  const audioFiles = linkedMaterials.filter(m => isAudioFile(m.fileKey));
  const videoFiles = linkedMaterials.filter(m => isVideoFile(m.fileKey));

  // --- NYTT: Hjälpfunktion för att rendera ett material-item ---
  const renderMaterialItem = (material: Material) => {
    const fullUrl = `${FILE_BASE_URL}/${material.fileKey}`;
    const displayName = material.title || material.fileKey;

    return (
      <li key={material.materialId} className={styles.materialItem}>
        <span className={styles.materialTitle}>{displayName}</span>
        <div className={styles.actions}>
          {isAudioFile(material.fileKey) && (
            <button onClick={() => setNowPlaying({ url: fullUrl, title: displayName })} className={styles.iconPlay} aria-label={`Spela ${displayName}`}>
              <FaPlayCircle size={22} />
            </button>
          )}
          {isVideoFile(material.fileKey) && (
            <button onClick={() => setMaterialToView(material)} className={styles.iconPlay} aria-label={`Spela video ${displayName}`}>
              <FaPlayCircle size={22} />
            </button>
          )}
          {isDocumentFile(material.fileKey) && (
            <button onClick={() => setMaterialToView(material)} className={styles.iconView} aria-label={`Visa ${displayName}`}>
              <IoEyeOutline size={24} />
            </button>
          )}
          <button onClick={() => handleUnlinkMaterial(material)} className={`${styles.iconDelete} ${styles.deleteButton}`} aria-label={`Ta bort koppling för ${displayName}`}>
            <IoTrashOutline size={22} />
          </button>
        </div>
      </li>
    );
  };

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

      {error && <p className={styles.errorMessage}>{error}</p>}

      {isLoading ? (
        <p>Laddar material...</p>
      ) : (
        <div>
          {/* --- UPPDATERAD RENDERINGS-LOGIK MED SEKTIONER --- */}
          {documents.length > 0 && (
            <section className={styles.categorySection}>
              <h3>Texter</h3>
              <ul className={styles.materialList}>
                {documents.map(renderMaterialItem)}
              </ul>
            </section>
          )}

          {audioFiles.length > 0 && (
            <section className={styles.categorySection}>
              <h3>Låtar</h3>
              <ul className={styles.materialList}>
                {audioFiles.map(renderMaterialItem)}
              </ul>
            </section>
          )}

          {videoFiles.length > 0 && (
            <section className={styles.categorySection}>
              <h3>Videos</h3>
              <ul className={styles.materialList}>
                {videoFiles.map(renderMaterialItem)}
              </ul>
            </section>
          )}
          
          {linkedMaterials.length === 0 && (
            <p>Inget material har kopplats till denna låt ännu.</p>
          )}
        </div>
      )}

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

      <Modal 
        isOpen={!!materialToUnlink} 
        onClose={() => setMaterialToUnlink(null)}
        title="Bekräfta borttagning av koppling"
      >
        <div>
          <p>
            Är du säker på att du vill ta bort kopplingen för 
            "{materialToUnlink?.title || materialToUnlink?.fileKey}"? 
            Materialet finns kvar i biblioteket.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <Button variant={ButtonVariant.Ghost} onClick={() => setMaterialToUnlink(null)}>
              Avbryt
            </Button>
            <Button variant={ButtonVariant.Primary} isLoading={isUnlinking} onClick={handleConfirmUnlink}>
              Ja, ta bort koppling
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
