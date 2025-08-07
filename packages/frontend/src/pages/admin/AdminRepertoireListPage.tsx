import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { IoTrashOutline, IoInformationCircleOutline } from 'react-icons/io5';
import { LibraryFolderPickerModal } from '@/components/media/LibraryFolderPickerModal';  // Importera den nya komponenten
import styles from './AdminRepertoireListPage.module.scss';

// --- TYPER ---
interface Repertoire {
  repertoireId: string;
  title: string;
  artist: string;
}

// Typen för en mappnod från vår nya modal
interface FolderNode {
  name: string;
  // ... andra fält om de finns
}

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export const AdminRepertoireListPage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const [repertoires, setRepertoires] = useState<Repertoire[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // --- State för modaler och anrop ---
  const [isPickerModalOpen, setIsPickerModalOpen] = useState(false);
  const [repertoireToDelete, setRepertoireToDelete] = useState<Repertoire | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAdding, setIsAdding] = useState(false); // ADDED: State för när vi lägger till

  // Funktion för att hämta repertoarer (oförändrad)
  const fetchRepertoires = useCallback(async () => {
    if (!groupName) return;
    setIsLoading(true);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/repertoires`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRepertoires(response.data);
    } catch (error) {
      console.error("Failed to fetch repertoires:", error);
    } finally {
      setIsLoading(false);
    }
  }, [groupName]);

  useEffect(() => {
    fetchRepertoires();
  }, [fetchRepertoires]);

  // Funktion för att hantera bekräftelse av radering (oförändrad)
  const handleConfirmDelete = async () => {
    if (!repertoireToDelete || !groupName) return;
    setIsDeleting(true);
    const token = localStorage.getItem('authToken');
    try {
      await axios.delete(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireToDelete.repertoireId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRepertoireToDelete(null);
      fetchRepertoires();
    } catch (error) {
      console.error("Failed to delete repertoire:", error);
      alert("Kunde inte radera låten från repertoaren.");
    } finally {
      setIsDeleting(false);
    }
  };
  
  // --- CHANGED: Fullt implementerad funktion för att lägga till från biblioteket ---
  const handleAddFromLibrary = async (folder: FolderNode) => {
    if (!groupName) return;

    setIsAdding(true);
    setIsPickerModalOpen(false); // Stäng modalen direkt
    const token = localStorage.getItem('authToken');

    try {
      // Anropa den nya backend-endpointen
      await axios.post(
        `${API_BASE_URL}/groups/${groupName}/repertoires/from-library`,
        { folderPath: folder.name }, // Skicka med mappens sökväg
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Hämta den uppdaterade listan för att visa den nya låten
      await fetchRepertoires();
    } catch (error) {
      console.error("Failed to add repertoire from library:", error);
      alert("Kunde inte lägga till låten från biblioteket. Mappen kanske redan finns i repertoaren.");
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return <div>Laddar repertoar...</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Låtar i Repertoaren</h2>
        {/* Knappen är inaktiv medan ett anrop för att lägga till pågår */}
        <Button onClick={() => setIsPickerModalOpen(true)} disabled={isAdding}>
          {isAdding ? 'Lägger till...' : 'Lägg till från bibliotek'}
        </Button>
      </div>
      <div className={styles.legend}>
        <IoInformationCircleOutline size={20} className={styles.legendIcon} />
        <p className={styles.legendText}>
          Tryck på ikonen <IoTrashOutline size={20} className={styles.inlineIcon} /> för ta bort en låt.
        </p>
      </div>

      <ul className={styles.repertoireList}>
        {repertoires.length > 0 ? (
          repertoires.map(item => (
            <li key={item.repertoireId} className={styles.repertoireItem}>
              <Link to={`${item.repertoireId}/materials`} state={{ repertoireTitle: item.title }} className={styles.songLink}>
                <span className={styles.songTitle}>{item.title}</span>
              </Link>
              <button
                onClick={() => setRepertoireToDelete(item)}
                className={styles.deleteButton}
                aria-label={`Radera ${item.title}`}
              >
                <IoTrashOutline size={20} />
              </button>
            </li>
          ))
        ) : (
          <p>Inga låtar har lagts till i repertoaren för denna kör ännu.</p>
        )}
      </ul>

      {isPickerModalOpen && (
        <LibraryFolderPickerModal 
          onClose={() => setIsPickerModalOpen(false)}
          onAdd={handleAddFromLibrary}
        />
      )}

      <Modal
        isOpen={!!repertoireToDelete}
        onClose={() => setRepertoireToDelete(null)}
        title="Bekräfta radering"
      >
        <div>
          <p>Är du säker på att du vill radera låten "{repertoireToDelete?.title}"? Allt material kopplat till låten raderas permanent.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <Button variant={ButtonVariant.Ghost} onClick={() => setRepertoireToDelete(null)}>Avbryt</Button>
            <Button variant={ButtonVariant.Primary} isLoading={isDeleting} onClick={handleConfirmDelete}>
              Ja, radera
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};