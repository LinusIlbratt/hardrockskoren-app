import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { MusicPlayerViewer } from '@/context/MusicPlayerOverlayContext';
import { getPracticeMaterials, type PracticeWeekGroup } from '@/services/practiceService';
import { getApiErrorMessage, isAbortError } from '@/utils/apiError';

function viewerFromRole(role: string | undefined): MusicPlayerViewer {
  if (role === 'admin') return 'admin';
  if (role === 'leader') return 'leader';
  return 'member';
}

/**
 * `viewer` från routen vinner. Utan prop används rollen i auth-context.
 * Materialet hämtas från member-view och är inte bundet till kör-sluggen.
 */
export function usePracticeView(groupSlug: string | undefined, viewer?: MusicPlayerViewer) {
  const { user, getAuthHeaders } = useAuth();
  const resolvedViewer = viewer ?? viewerFromRole(user?.role);
  const [weeklyMaterials, setWeeklyMaterials] = useState<PracticeWeekGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setIsLoading(true);
    setError(null);

    if (!getAuthHeaders().Authorization) {
      setWeeklyMaterials([]);
      setError('Du måste vara inloggad för att se detta material.');
      setIsLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    getPracticeMaterials({ signal: controller.signal })
      .then((weeks) => {
        if (!active) return;
        setWeeklyMaterials(weeks);
      })
      .catch((fetchError: unknown) => {
        if (!active || isAbortError(fetchError)) return;
        setWeeklyMaterials([]);
        setError(
          getApiErrorMessage(
            fetchError,
            'Kunde inte hämta övningsmaterial. Försök igen senare.'
          )
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [groupSlug, getAuthHeaders]);

  return {
    weeklyMaterials,
    isLoading,
    error,
    viewer: resolvedViewer,
  };
}
