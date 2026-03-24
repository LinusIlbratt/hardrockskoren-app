import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as musicService from '@/services/musicService';
import type { Material } from '@/types';

export type FavoritesContextValue = {
  favoriteMaterialIds: string[];
  favoriteMaterials: Material[];
  toggleFavoriteOptimistic: (materialId: string) => Promise<void>;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
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
        console.error('FavoritesProvider: failed to load favorites', err);
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
      console.error('FavoritesProvider: toggleFavorite failed, reverting', err);
      setFavoriteMaterialIds(previousIds);
      try {
        const materials = await musicService.getFavorites();
        setFavoriteMaterials(materials);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const value = useMemo(
    () => ({
      favoriteMaterialIds,
      favoriteMaterials,
      toggleFavoriteOptimistic,
    }),
    [favoriteMaterialIds, favoriteMaterials, toggleFavoriteOptimistic],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return ctx;
}
