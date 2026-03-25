export type MusicResumePayload =
  | { source: 'repertoire'; repertoireId: string; materialId: string }
  | { source: 'playlist'; playlistId: string; materialId: string };

/** Start i repertoarläge (sidebar synlig) — inte library mode. */
export type RepertoirePlaybackIntent =
  | { type: 'fromMaterialId'; materialId: string }
  | { type: 'fromIndex'; index: number };

/**
 * browse: ladda repertoar/spellista utan att starta uppspelning (ingen pendingResume).
 * playAll: när initialRepertoireId satts → spela från index 0 efter laddning.
 */
export type OpenMusicPlaybackIntent =
  | 'browse'
  | 'playAll'
  | RepertoirePlaybackIntent;

export interface OpenMusicOptions {
  resume?: MusicResumePayload;
  startMinimized?: boolean;
  /** Öppnar panelen med vald repertoar direkt (isLibraryMode förblir false). */
  initialRepertoireId?: string;
  /** Spellista (browse/play) — används av panelen istället för initialRepertoireId när satt. */
  initialPlaylistId?: string;
  /** Valfritt: börja spela detta spår när material laddats. */
  repertoirePlayback?: RepertoirePlaybackIntent;
  /**
   * browse: öppna listor utan auto-play (resume används bara som navigationsmål).
   * playAll / fromIndex / fromMaterialId: efter laddning starta uppspelning (om mål finns).
   */
  playbackIntent?: OpenMusicPlaybackIntent;
}

export const RECENT_PLAYBACK_STORAGE_KEY = 'hrk-recent-playback';

/** Dispatched on same-tab updates (storage event only fires cross-tab). */
export const RECENT_PLAYBACK_CHANGE_EVENT = 'hrk-recent-playback-change';

export type RecentPlaybackKind = 'repertoire' | 'playlist';

export interface RecentPlaybackEntry {
  groupSlug: string;
  kind: RecentPlaybackKind;
  materialId: string;
  title: string;
  updatedAt: string;
  repertoireId?: string;
  playlistId?: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidEntry(x: unknown): x is RecentPlaybackEntry {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (!isNonEmptyString(o.groupSlug)) return false;
  if (o.kind !== 'repertoire' && o.kind !== 'playlist') return false;
  if (!isNonEmptyString(o.materialId)) return false;
  if (!isNonEmptyString(o.title)) return false;
  if (!isNonEmptyString(o.updatedAt)) return false;
  if (o.kind === 'repertoire' && !isNonEmptyString(o.repertoireId)) return false;
  if (o.kind === 'playlist' && !isNonEmptyString(o.playlistId)) return false;
  return true;
}

export function loadRecentPlayback(): RecentPlaybackEntry | null {
  try {
    const raw = localStorage.getItem(RECENT_PLAYBACK_STORAGE_KEY);
    if (!raw?.trim()) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadRecentPlaybackForGroup(groupSlug: string | undefined): RecentPlaybackEntry | null {
  const g = groupSlug?.trim();
  if (!g) return null;
  const entry = loadRecentPlayback();
  if (!entry || entry.groupSlug !== g) return null;
  return entry;
}

export function saveRecentPlayback(
  entry: Omit<RecentPlaybackEntry, 'updatedAt'>
): void {
  try {
    const full: RecentPlaybackEntry = {
      ...entry,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(RECENT_PLAYBACK_STORAGE_KEY, JSON.stringify(full));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(RECENT_PLAYBACK_CHANGE_EVENT));
    }
  } catch (e) {
    console.error('saveRecentPlayback failed', e);
  }
}

export function entryToResumePayload(entry: RecentPlaybackEntry): MusicResumePayload | null {
  if (entry.kind === 'playlist' && entry.playlistId?.trim()) {
    return {
      source: 'playlist',
      playlistId: entry.playlistId.trim(),
      materialId: entry.materialId.trim(),
    };
  }
  if (entry.kind === 'repertoire' && entry.repertoireId?.trim()) {
    return {
      source: 'repertoire',
      repertoireId: entry.repertoireId.trim(),
      materialId: entry.materialId.trim(),
    };
  }
  return null;
}
