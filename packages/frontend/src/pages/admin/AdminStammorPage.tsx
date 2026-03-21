import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { IoTrashOutline, IoInformationCircleOutline, IoCreateOutline } from 'react-icons/io5';
import styles from './AdminStammorPage.module.scss';

interface VoicePlaylist {
  playlistId: string;
  title: string;
  trackOrder: string[];
  createdAt?: string;
}

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export const AdminStammorPage = () => {
  const [playlists, setPlaylists] = useState<VoicePlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [playlistToDelete, setPlaylistToDelete] = useState<VoicePlaylist | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaylists = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get<VoicePlaylist[]>(`${API_BASE_URL}/voice-playlists`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPlaylists(response.data ?? []);
    } catch (err) {
      console.error('Failed to fetch voice playlists:', err);
      setError('Kunde inte hämta listan med stämplaylists.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const handleConfirmDelete = async () => {
    if (!playlistToDelete) return;
    setIsDeleting(true);
    const token = localStorage.getItem('authToken');
    try {
      await axios.delete(`${API_BASE_URL}/voice-playlists/${playlistToDelete.playlistId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPlaylistToDelete(null);
      fetchPlaylists();
    } catch (err) {
      console.error('Failed to delete voice playlist:', err);
      setError('Kunde inte radera playlisten.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <p>Laddar stämplaylists...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Stämmor</h2>
        <Link to="new" className={styles.createButton}>
          Skapa ny playlist
        </Link>
      </div>

      <div className={styles.legend}>
        <IoInformationCircleOutline size={20} className={styles.legendIcon} />
        <p className={styles.legendText}>
          Här skapar du playlists med stämmor (ljudfiler) per låt. Alla körer får tillgång till samma playlists.
          Använd <IoCreateOutline size={18} className={styles.inlineIcon} /> för att redigera och{' '}
          <IoTrashOutline size={18} className={styles.inlineIcon} /> för att radera.
        </p>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <ul className={styles.playlistList}>
        {playlists.length > 0 ? (
          playlists.map((item) => (
            <li key={item.playlistId} className={styles.playlistItem}>
              <Link to={item.playlistId} className={styles.playlistLink}>
                <span className={styles.playlistTitle}>{item.title}</span>
                <span className={styles.trackCount}>
                  {item.trackOrder?.length ?? 0} stämmor
                </span>
              </Link>
              <div className={styles.actions}>
                <Link
                  to={item.playlistId}
                  className={styles.editButton}
                  aria-label={`Redigera ${item.title}`}
                >
                  <IoCreateOutline size={20} />
                </Link>
                <button
                  type="button"
                  onClick={() => setPlaylistToDelete(item)}
                  className={styles.deleteButton}
                  aria-label={`Radera ${item.title}`}
                >
                  <IoTrashOutline size={20} />
                </button>
              </div>
            </li>
          ))
        ) : (
          <p className={styles.empty}>Inga stämplaylists ännu. Skapa en för att komma igång.</p>
        )}
      </ul>

      <Modal
        isOpen={!!playlistToDelete}
        onClose={() => setPlaylistToDelete(null)}
        title="Bekräfta radering"
      >
        <div>
          <p>
            Är du säker på att du vill radera playlisten &quot;{playlistToDelete?.title}&quot;?
          </p>
          <div className={styles.modalActions}>
            <Button variant={ButtonVariant.Ghost} onClick={() => setPlaylistToDelete(null)}>
              Avbryt
            </Button>
            <Button
              variant={ButtonVariant.Primary}
              isLoading={isDeleting}
              onClick={handleConfirmDelete}
            >
              Ja, radera
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
