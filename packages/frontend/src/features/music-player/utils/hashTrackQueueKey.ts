import type { MediaPlayerTrack } from '@/features/music-player/types';

/** Stable queue identity — use materialIds, not presigned src URLs. */
export function hashTrackQueueKey(tracks: MediaPlayerTrack[]): string {
  const sig = tracks.map((t) => t.materialId ?? t.src).join('\0');
  let h = 0;
  for (let i = 0; i < sig.length; i += 1) {
    h = (Math.imul(31, h) + sig.charCodeAt(i)) | 0;
  }
  return `m${(h >>> 0).toString(36)}`;
}
