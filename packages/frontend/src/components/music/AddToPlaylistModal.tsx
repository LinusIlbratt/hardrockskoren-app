import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal/Modal';
import { DiscardChangesConfirm } from '@/components/ui/form/DiscardChangesConfirm';
import { useModalFormGuard } from '@/hooks/useModalFormGuard';
import { usePlaylists } from '@/hooks/usePlaylists';
import * as musicService from '@/services/musicService';
import styles from './AddToPlaylistModal.module.scss';

export interface AddToPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  materialId: string | null;
}

function formatError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return 'Något gick fel. Försök igen.';
}

interface AddToPlaylistModalBodyProps {
  materialId: string;
  onClose: () => void;
}

function AddToPlaylistModalBody({ materialId, onClose }: AddToPlaylistModalBodyProps) {
  const {
    playlists,
    isLoading,
    error: playlistsHookError,
    createNewPlaylist,
    fetchPlaylists,
  } = usePlaylists();

  const [actionError, setActionError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [busyPlaylistId, setBusyPlaylistId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const isBusy = creating || busyPlaylistId !== null;
  const isDirty = newTitle.trim().length > 0;

  const {
    showDiscardConfirm,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  } = useModalFormGuard({ isDirty, isBlocked: isBusy, onCloseFallback: onClose });

  useEffect(() => {
    void fetchPlaylists();
  }, [fetchPlaylists]);

  const handleSelectPlaylist = useCallback(
    async (playlistId: string) => {
      setActionError(null);
      setBusyPlaylistId(playlistId);
      try {
        await musicService.addPlaylistItem(playlistId, materialId);
        onClose();
      } catch (err) {
        setActionError(formatError(err));
      } finally {
        setBusyPlaylistId(null);
      }
    },
    [materialId, onClose]
  );

  const handleCreateAndAdd = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) {
      setActionError('Ange en titel för spellistan.');
      return;
    }
    setActionError(null);
    setCreating(true);
    try {
      const created = await createNewPlaylist(title);
      await musicService.addPlaylistItem(created.playlistId, materialId);
      onClose();
    } catch (err) {
      setActionError(formatError(err));
    } finally {
      setCreating(false);
    }
  }, [createNewPlaylist, materialId, newTitle, onClose]);

  const combinedError = actionError || playlistsHookError;

  return (
    <div className={styles.body}>
      {combinedError && (
        <p role="alert" className={styles.error}>
          {combinedError}
        </p>
      )}

      <div>
        <p className={styles.sectionTitle}>Dina spellistor</p>
        {isLoading ? (
          <p className={styles.hint}>Laddar spellistor…</p>
        ) : playlists.length === 0 ? (
          <p className={styles.hint}>
            Du har inga spellistor ännu. Skapa en nedan.
          </p>
        ) : (
          <ul className={styles.list}>
            {playlists.map((p) => (
              <li key={p.playlistId}>
                <button
                  type="button"
                  className={styles.row}
                  disabled={busyPlaylistId === p.playlistId || creating}
                  onClick={() => void handleSelectPlaylist(p.playlistId)}
                >
                  <span>{p.title}</span>
                  {p.description ? (
                    <span className={styles.description}>{p.description}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.createSection}>
        <p className={styles.sectionTitle}>Skapa ny spellista</p>
        <label htmlFor="add-to-playlist-new-title" className={styles.label}>
          Titel
          <input
            id="add-to-playlist-new-title"
            className={styles.input}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            disabled={creating}
            placeholder="Min spellista"
          />
        </label>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={requestClose}
            disabled={isBusy}
          >
            Avbryt
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={creating}
            onClick={() => void handleCreateAndAdd()}
          >
            {creating ? 'Skapar…' : 'Skapa och lägg till'}
          </button>
        </div>
      </div>

      {showDiscardConfirm && (
        <DiscardChangesConfirm onConfirm={confirmDiscard} onCancel={cancelDiscard} />
      )}
    </div>
  );
}

export function AddToPlaylistModal({
  isOpen,
  onClose,
  materialId,
}: AddToPlaylistModalProps) {
  if (!isOpen || !materialId) {
    return null;
  }

  return (
    <Modal formMode tone="library" isOpen={isOpen} onClose={onClose} title="Lägg till i spellista">
      <AddToPlaylistModalBody materialId={materialId} onClose={onClose} />
    </Modal>
  );
}
