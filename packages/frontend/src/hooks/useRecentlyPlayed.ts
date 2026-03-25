import { useCallback, useEffect, useState } from 'react';
import {
  loadRecentPlaybackForGroup,
  RECENT_PLAYBACK_CHANGE_EVENT,
  RECENT_PLAYBACK_STORAGE_KEY,
  type RecentPlaybackEntry,
} from '@/utils/recentPlayback';

/**
 * Senaste uppspelning för aktuell kör (localStorage), uppdateras vid ändringar.
 */
export function useRecentlyPlayed(groupSlug: string | undefined): RecentPlaybackEntry | null {
  const [entry, setEntry] = useState<RecentPlaybackEntry | null>(() =>
    loadRecentPlaybackForGroup(groupSlug)
  );

  const sync = useCallback(() => {
    setEntry(loadRecentPlaybackForGroup(groupSlug));
  }, [groupSlug]);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === RECENT_PLAYBACK_STORAGE_KEY || e.key === null) sync();
    };
    window.addEventListener(RECENT_PLAYBACK_CHANGE_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(RECENT_PLAYBACK_CHANGE_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, [sync]);

  return entry;
}
