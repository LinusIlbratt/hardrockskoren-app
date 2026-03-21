import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import type { Material } from '@/types';
import styles from './AdminStammorFormPage.module.scss';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

const AUDIO_REGEX = /\.(mp3|wav|m4a)$/i;
const isAudio = (fileKey: string) => fileKey && AUDIO_REGEX.test(fileKey);

interface VoicePlaylistWithTracks {
  playlistId: string;
  title: string;
  trackOrder: string[];
  tracks?: { materialId: string; fileKey: string | null; title: string }[];
}

export const AdminStammorFormPage = () => {
  const { playlistId } = useParams<{ playlistId: string }>();
  const navigate = useNavigate();
  const isNew = playlistId === 'new';

  const [title, setTitle] = useState('');
  const [trackOrder, setTrackOrder] = useState<string[]>([]);
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addMaterialId, setAddMaterialId] = useState('');

  const token = localStorage.getItem('authToken');
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  const audioMaterials = allMaterials.filter((m) => m.fileKey && isAudio(m.fileKey));

  const fetchMaterials = useCallback(async () => {
    setIsLoadingMaterials(true);
    try {
      const response = await axios.get<Material[]>(`${API_BASE_URL}/materials`, authHeaders);
      setAllMaterials(response.data ?? []);
    } catch (err) {
      console.error('Failed to fetch materials:', err);
      setError('Kunde inte hämta materiallistan.');
    } finally {
      setIsLoadingMaterials(false);
    }
  }, []);

  const fetchPlaylist = useCallback(async () => {
    if (!playlistId || isNew) return;
    setIsLoadingPlaylist(true);
    setError(null);
    try {
      const response = await axios.get<VoicePlaylistWithTracks>(
        `${API_BASE_URL}/voice-playlists/${playlistId}`,
        authHeaders
      );
      setTitle(response.data.title ?? '');
      setTrackOrder(response.data.trackOrder ?? []);
    } catch (err) {
      console.error('Failed to fetch playlist:', err);
      setError('Kunde inte hämta playlisten.');
    } finally {
      setIsLoadingPlaylist(false);
    }
  }, [playlistId, isNew]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  useEffect(() => {
    fetchPlaylist();
  }, [fetchPlaylist]);

  const addTrack = () => {
    if (!addMaterialId || trackOrder.includes(addMaterialId)) return;
    setTrackOrder((prev) => [...prev, addMaterialId]);
    setAddMaterialId('');
  };

  const removeTrack = (index: number) => {
    setTrackOrder((prev) => prev.filter((_, i) => i !== index));
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    setTrackOrder((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const moveDown = (index: number) => {
    if (index >= trackOrder.length - 1) return;
    setTrackOrder((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  };

  const getDisplayName = (materialId: string) => {
    const m = allMaterials.find((x) => x.materialId === materialId);
    return m?.title || m?.fileKey?.split('/').pop() || materialId;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Titel krävs.');
      return;
    }
    setIsSaving(true);
    try {
      if (isNew) {
        await axios.post(
          `${API_BASE_URL}/voice-playlists`,
          { title: trimmedTitle, trackOrder },
          authHeaders
        );
      } else {
        await axios.put(
          `${API_BASE_URL}/voice-playlists/${playlistId}`,
          { title: trimmedTitle, trackOrder },
          authHeaders
        );
      }
      navigate('/admin/stammor');
    } catch (err) {
      console.error('Failed to save playlist:', err);
      const msg = axios.isAxiosError(err) && err.response?.data?.message;
      setError(msg || 'Kunde inte spara playlisten.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isNew && isLoadingPlaylist) {
    return (
      <div className={styles.page}>
        <p>Laddar playlist...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link to="/admin/stammor" className={styles.backLink}>
        ← Tillbaka till Stämmor
      </Link>

      <h2 className={styles.title}>{isNew ? 'Ny stämplaylist' : 'Redigera playlist'}</h2>

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.field}>
          <label htmlFor="stammor-title">Titel (låtnamn)</label>
          <input
            id="stammor-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="t.ex. Låtens namn"
            className={styles.input}
          />
        </div>

        <div className={styles.field}>
          <label>Stämmor (ljudfiler i ordning)</label>
          {isLoadingMaterials ? (
            <p className={styles.hint}>Laddar material...</p>
          ) : audioMaterials.length === 0 ? (
            <p className={styles.hint}>Inga ljudfiler i mediabiblioteket. Ladda upp under Material.</p>
          ) : (
            <>
              <div className={styles.addRow}>
                <select
                  value={addMaterialId}
                  onChange={(e) => setAddMaterialId(e.target.value)}
                  className={styles.select}
                  aria-label="Välj ljudfil att lägga till"
                >
                  <option value="">Välj stämma att lägga till</option>
                  {audioMaterials
                    .filter((m) => !trackOrder.includes(m.materialId))
                    .map((m) => (
                      <option key={m.materialId} value={m.materialId}>
                        {m.title || m.fileKey?.split('/').pop() || m.materialId}
                      </option>
                    ))}
                </select>
                <Button type="button" onClick={addTrack} disabled={!addMaterialId}>
                  Lägg till
                </Button>
              </div>

              <ul className={styles.trackList}>
                {trackOrder.map((id, index) => (
                  <li key={`${id}-${index}`} className={styles.trackItem}>
                    <span className={styles.trackIndex}>{index + 1}.</span>
                    <span className={styles.trackName}>{getDisplayName(id)}</span>
                    <div className={styles.trackActions}>
                      <button
                        type="button"
                        onClick={() => moveUp(index)}
                        disabled={index === 0}
                        className={styles.smallButton}
                        aria-label="Flytta upp"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDown(index)}
                        disabled={index === trackOrder.length - 1}
                        className={styles.smallButton}
                        aria-label="Flytta ner"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTrack(index)}
                        className={styles.removeButton}
                        aria-label="Ta bort"
                      >
                        Ta bort
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {trackOrder.length === 0 && (
                <p className={styles.hint}>Lägg till minst en stämma (ljudfil) från listan ovan.</p>
              )}
            </>
          )}
        </div>

        <div className={styles.actions}>
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            onClick={() => navigate('/admin/stammor')}
          >
            Avbryt
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isNew ? 'Skapa playlist' : 'Spara'}
          </Button>
        </div>
      </form>
    </div>
  );
};
