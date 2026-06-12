import { useCallback, useEffect, useState } from 'react';
import * as musicService from '@/services/musicService';
import type { PlaylistItem } from '@/services/musicService';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

/**
 * Låtar i en spellista (hydrerade) med optimistisk borttagning.
 */
export function usePlaylistItems(playlistId: string | undefined) {
  const [items, setItems] = useState<PlaylistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = playlistId?.trim();
    if (!id) {
      setItems([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const list = await musicService.getPlaylistItems(id);
        if (!cancelled) {
          setItems(list);
        }
      } catch (err) {
        console.error('usePlaylistItems: fetch failed', err);
        if (!cancelled) {
          setError(errorMessage(err, 'Kunde inte hämta spellistan.'));
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  const removeItem = useCallback(
    async (materialId: string) => {
      const pid = playlistId?.trim();
      const mid = materialId?.trim();
      if (!pid || !mid) return;

      let previous: PlaylistItem[] = [];

      setItems((current) => {
        previous = [...current];
        return current.filter((x) => x.materialId !== mid);
      });

      try {
        await musicService.removePlaylistItem(pid, mid);
      } catch (err) {
        console.error('usePlaylistItems: removePlaylistItem failed', err);
        setItems(previous);
      }
    },
    [playlistId]
  );

  return { items, isLoading, error, removeItem };
}
