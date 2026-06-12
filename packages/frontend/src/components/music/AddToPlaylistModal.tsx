import { useCallback, useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal/Modal';
import { usePlaylists } from '@/hooks/usePlaylists';
import * as musicService from '@/services/musicService';

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

export function AddToPlaylistModal({
  isOpen,
  onClose,
  materialId,
}: AddToPlaylistModalProps) {
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

  useEffect(() => {
    if (!isOpen) {
      setActionError(null);
      setNewTitle('');
      setBusyPlaylistId(null);
      setCreating(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && materialId) {
      void fetchPlaylists();
    }
  }, [isOpen, materialId, fetchPlaylists]);

  const handleSelectPlaylist = useCallback(
    async (playlistId: string) => {
      if (!materialId) return;
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
    if (!materialId) return;
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
      setNewTitle('');
      onClose();
    } catch (err) {
      setActionError(formatError(err));
    } finally {
      setCreating(false);
    }
  }, [createNewPlaylist, materialId, newTitle, onClose]);

  if (!isOpen || !materialId) {
    return null;
  }

  const combinedError = actionError || playlistsHookError;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Lägg till i spellista"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {combinedError && (
          <p
            role="alert"
            style={{ margin: 0, color: '#b91c1c', fontSize: '0.9rem' }}
          >
            {combinedError}
          </p>
        )}

        <div>
          <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.9rem' }}>
            Dina spellistor
          </p>
          {isLoading ? (
            <p style={{ margin: 0, color: '#666' }}>Laddar spellistor…</p>
          ) : playlists.length === 0 ? (
            <p style={{ margin: 0, color: '#666' }}>
              Du har inga spellistor ännu. Skapa en nedan.
            </p>
          ) : (
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {playlists.map((p) => (
                <li key={p.playlistId}>
                  <button
                    type="button"
                    disabled={busyPlaylistId === p.playlistId || creating}
                    onClick={() => void handleSelectPlaylist(p.playlistId)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: 8,
                      background: '#fafafa',
                      cursor:
                        busyPlaylistId === p.playlistId || creating
                          ? 'wait'
                          : 'pointer',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{p.title}</span>
                    {p.description ? (
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.8rem',
                          color: '#666',
                          marginTop: 4,
                        }}
                      >
                        {p.description}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          style={{
            borderTop: '1px solid #eee',
            paddingTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
            Skapa ny spellista
          </p>
          <label htmlFor="add-to-playlist-new-title" style={{ fontSize: '0.85rem' }}>
            Titel
            <input
              id="add-to-playlist-new-title"
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={creating}
              placeholder="Min spellista"
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #ccc',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <button
            type="button"
            disabled={creating}
            onClick={() => void handleCreateAndAdd()}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#1a1a1a',
              color: '#fff',
              cursor: creating ? 'wait' : 'pointer',
            }}
          >
            {creating ? 'Skapar…' : 'Skapa och lägg till'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
