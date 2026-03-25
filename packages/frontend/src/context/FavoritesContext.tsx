import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as musicService from '@/services/musicService';
import type { Material } from '@/types';

const FAVORITE_TOGGLE_ERROR_MS = 4500;

export type FavoritesContextValue = {
  favoriteMaterialIds: string[];
  favoriteMaterials: Material[];
  /**
   * Optimistic favorite toggle: updates local state immediately, then POSTs in the background.
   * When adding a favorite, pass `materialHint` so `favoriteMaterials` stays in sync without refetch.
   */
  toggleFavoriteOptimistic: (materialId: string, materialHint?: Material) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [favoriteMaterialIds, setFavoriteMaterialIds] = useState<string[]>([]);
  const [favoriteMaterials, setFavoriteMaterials] = useState<Material[]>([]);
  const [toggleErrorMessage, setToggleErrorMessage] = useState<string | null>(null);

  const favoriteMaterialIdsRef = useRef<string[]>([]);
  const favoriteMaterialsRef = useRef<Material[]>([]);

  useEffect(() => {
    favoriteMaterialIdsRef.current = favoriteMaterialIds;
  }, [favoriteMaterialIds]);

  useEffect(() => {
    favoriteMaterialsRef.current = favoriteMaterials;
  }, [favoriteMaterials]);

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

  useEffect(() => {
    if (!toggleErrorMessage) return undefined;
    const t = window.setTimeout(() => setToggleErrorMessage(null), FAVORITE_TOGGLE_ERROR_MS);
    return () => window.clearTimeout(t);
  }, [toggleErrorMessage]);

  const toggleFavoriteOptimistic = useCallback((materialId: string, materialHint?: Material) => {
    const id = materialId?.trim();
    if (!id) return;

    const prevIds = [...favoriteMaterialIdsRef.current];
    const prevMats = [...favoriteMaterialsRef.current];
    const wasFavorite = prevIds.includes(id);

    const nextIds = wasFavorite ? prevIds.filter((x) => x !== id) : [...prevIds, id];

    let nextMats: Material[];
    if (wasFavorite) {
      nextMats = prevMats.filter((m) => m.materialId !== id);
    } else if (materialHint && !prevMats.some((m) => m.materialId === id)) {
      nextMats = [...prevMats, materialHint];
    } else {
      nextMats = prevMats;
    }

    setFavoriteMaterialIds(nextIds);
    setFavoriteMaterials(nextMats);

    void musicService.toggleFavorite(id).catch((err) => {
      console.error('FavoritesProvider: toggleFavorite failed, reverting', err);
      setFavoriteMaterialIds(prevIds);
      setFavoriteMaterials(prevMats);
      setToggleErrorMessage('Kunde inte uppdatera favoriter. Försök igen.');
    });
  }, []);

  const value = useMemo(
    () => ({
      favoriteMaterialIds,
      favoriteMaterials,
      toggleFavoriteOptimistic,
    }),
    [favoriteMaterialIds, favoriteMaterials, toggleFavoriteOptimistic],
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
      {toggleErrorMessage ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: '1.25rem',
            left: '50%',
            transform: 'translateX(-50%)',
            maxWidth: 'min(90vw, 24rem)',
            padding: '0.65rem 1rem',
            borderRadius: '8px',
            background: 'rgba(30, 30, 35, 0.92)',
            color: '#f5f5f5',
            fontSize: '0.875rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            zIndex: 9999,
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          {toggleErrorMessage}
        </div>
      ) : null}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return ctx;
}
