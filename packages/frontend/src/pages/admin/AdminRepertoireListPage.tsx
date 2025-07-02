import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { CreateRepertoireForm } from '@/components/ui/form/CreateRepertoireForm'; // Importera den nya komponenten
import { IoTrashOutline } from 'react-icons/io5';
import styles from './AdminRepertoireListPage.module.scss';

// Definiera en typ för repertoar-objektet
interface Repertoire {
  repertoireId: string;
  title: string;
  artist: string;
}

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export const AdminRepertoireListPage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const [repertoires, setRepertoires] = useState<Repertoire[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // State för modaler
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [repertoireToDelete, setRepertoireToDelete] = useState<Repertoire | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Funktion för att hämta repertoarer
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

  // Hämta data när komponenten laddas
  useEffect(() => {
    fetchRepertoires();
  }, [fetchRepertoires]);

  const onRepertoireCreated = () => {
    setIsCreateModalOpen(false);
    fetchRepertoires(); // Hämta den uppdaterade listan
  }

  // Funktion för att hantera bekräftelse av radering
  const handleConfirmDelete = async () => {
    if (!repertoireToDelete || !groupName) return;

    setIsDeleting(true);
    const token = localStorage.getItem('authToken');
    try {
      await axios.delete(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireToDelete.repertoireId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRepertoireToDelete(null); // Stäng modalen
      fetchRepertoires(); // Hämta den uppdaterade listan
    } catch (error) {
      console.error("Failed to delete repertoire:", error);
      alert("Kunde inte radera låten från repertoaren.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <div>Laddar repertoar...</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Låtar i Repertoaren</h2>
        <Button onClick={() => setIsCreateModalOpen(true)}>Skapa ny låt</Button>
      </div>

      <ul className={styles.repertoireList}>
        {repertoires.length > 0 ? (
          repertoires.map(item => (
            <li key={item.repertoireId} className={styles.repertoireItem}>
              <Link to={`${item.repertoireId}/materials`} state={{ repertoireTitle: item.title }} className={styles.songLink}>
                <span className={styles.songTitle}>{item.title}</span>
                <span className={styles.songArtist}>{item.artist}</span>
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
          <p>Inga låtar har lagts till i repertoaren för denna grupp ännu.</p>
        )}
      </ul>

      {/* Modal för att skapa en ny låt */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Skapa ny låt i repertoaren"
      >
        {/* Använd den nya formulär-komponenten och skicka med onSuccess-funktionen */}
        <CreateRepertoireForm onSuccess={onRepertoireCreated} />
      </Modal>

      {/* Modal för att bekräfta radering */}
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
