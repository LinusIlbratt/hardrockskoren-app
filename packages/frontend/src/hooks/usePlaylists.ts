import { useCallback, useEffect, useState } from 'react';
import * as musicService from '@/services/musicService';
import type { Playlist } from '@/services/musicService';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

/**
 * Spellistor från music-api: hämtning vid mount + skapa ny lista.
 */
export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaylists = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const list = await musicService.getPlaylists();
      setPlaylists(list);
    } catch (err) {
      console.error('usePlaylists: fetchPlaylists failed', err);
      setError(errorMessage(err, 'Kunde inte hämta spellistor.'));
      setPlaylists([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlaylists();
  }, [fetchPlaylists]);

  const createNewPlaylist = useCallback(
    async (title: string, description?: string): Promise<Playlist> => {
      setError(null);
      try {
        const created = await musicService.createPlaylist(title, description);
        setPlaylists((prev) => [...prev, created]);
        return created;
      } catch (err) {
        console.error('usePlaylists: createNewPlaylist failed', err);
        setError(errorMessage(err, 'Kunde inte skapa spellista.'));
        throw err;
      }
    },
    []
  );

  const renamePlaylist = useCallback(async (playlistId: string, title: string) => {
    setError(null);
    try {
      const updated = await musicService.updatePlaylist(playlistId, title);
      setPlaylists((prev) => prev.map((p) => (p.playlistId === playlistId ? updated : p)));
    } catch (err) {
      console.error('usePlaylists: renamePlaylist failed', err);
      setError(errorMessage(err, 'Kunde inte byta namn på spellistan.'));
      throw err;
    }
  }, []);

  const deletePlaylist = useCallback(async (playlistId: string) => {
    setError(null);
    try {
      await musicService.deletePlaylist(playlistId);
      setPlaylists((prev) => prev.filter((p) => p.playlistId !== playlistId));
    } catch (err) {
      console.error('usePlaylists: deletePlaylist failed', err);
      setError(errorMessage(err, 'Kunde inte ta bort spellistan.'));
      throw err;
    }
  }, []);

  return {
    playlists,
    isLoading,
    error,
    fetchPlaylists,
    createNewPlaylist,
    renamePlaylist,
    deletePlaylist,
  };
}
