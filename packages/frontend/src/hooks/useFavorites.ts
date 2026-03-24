import { useCallback, useEffect, useState } from 'react';
import * as musicService from '@/services/musicService';
import type { Material } from '@/types';

/**
 * Favoritmaterial för inloggad användare + optimistisk toggle mot music-api.
 */
export function useFavorites() {
  const [favoriteMaterialIds, setFavoriteMaterialIds] = useState<string[]>([]);
  const [favoriteMaterials, setFavoriteMaterials] = useState<Material[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const materials = await musicService.getFavorites();
        if (!cancelled) {
          setFavoriteMaterialIds(materials.map((m) => m.materialId));
          setFavoriteMaterials(materials);
        }
      } catch (err) {
        console.error('useFavorites: failed to load favorites', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFavoriteOptimistic = useCallback(async (materialId: string) => {
    const id = materialId?.trim();
    if (!id) return;

    let previousIds: string[] = [];

    setFavoriteMaterialIds((current) => {
      previousIds = [...current];
      if (current.includes(id)) {
        return current.filter((x) => x !== id);
      }
      return [...current, id];
    });

    try {
      await musicService.toggleFavorite(id);
      const materials = await musicService.getFavorites();
      setFavoriteMaterialIds(materials.map((m) => m.materialId));
      setFavoriteMaterials(materials);
    } catch (err) {
      console.error('useFavorites: toggleFavorite failed, reverting', err);
      setFavoriteMaterialIds(previousIds);
      try {
        const materials = await musicService.getFavorites();
        setFavoriteMaterials(materials);
      } catch {
        /* ignore */
      }
    }
  }, []);

  return {
    favoriteMaterialIds,
    favoriteMaterials,
    toggleFavoriteOptimistic,
  };
}
