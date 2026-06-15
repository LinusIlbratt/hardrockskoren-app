import axios from 'axios';
import type { Material } from '@/types';
import type { MediaPlayerTrack } from '@/components/media/MediaPlayer';
import { formatDisplayTitle, isPlayableAudioFile } from '@/utils/media';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL as string;
const BATCH_SIZE = 50;
/** Cache slightly below presigned URL lifetime (1 h from API). */
const CACHE_TTL_MS = 50 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };

const urlCache = new Map<string, CacheEntry>();

function cacheGet(fileKey: string): string | undefined {
  const entry = urlCache.get(fileKey);
  if (!entry || entry.expiresAt <= Date.now()) {
    urlCache.delete(fileKey);
    return undefined;
  }
  return entry.url;
}

function cacheSet(fileKey: string, url: string, expiresInSeconds: number): void {
  const ttlMs = Math.min(CACHE_TTL_MS, Math.max(60_000, expiresInSeconds * 1000 - 60_000));
  urlCache.set(fileKey, { url, expiresAt: Date.now() + ttlMs });
}

/**
 * Resolves presigned media URLs for in-app playback (audio, video, PDF viewer).
 * Not exposed as user-facing download links.
 */
export async function getMediaDownloadUrls(
  fileKeys: string[],
  authHeaders: Record<string, string>
): Promise<Record<string, string>> {
  const normalized = [...new Set(fileKeys.map((k) => k.trim()).filter(Boolean))];
  if (normalized.length === 0) return {};

  const result: Record<string, string> = {};
  const toFetch: string[] = [];

  for (const key of normalized) {
    const cached = cacheGet(key);
    if (cached) {
      result[key] = cached;
    } else {
      toFetch.push(key);
    }
  }

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const chunk = toFetch.slice(i, i + BATCH_SIZE);
    const response = await axios.post<{ urls: Record<string, string>; expiresIn: number }>(
      `${API_BASE_URL}/materials/download-urls`,
      { fileKeys: chunk },
      { headers: { ...authHeaders } }
    );
    const { urls, expiresIn } = response.data;
    for (const [fileKey, url] of Object.entries(urls ?? {})) {
      cacheSet(fileKey, url, expiresIn ?? 3600);
      result[fileKey] = url;
    }
  }

  return result;
}

export async function getMediaDownloadUrl(
  fileKey: string,
  authHeaders: Record<string, string>
): Promise<string> {
  const key = fileKey.trim();
  const urls = await getMediaDownloadUrls([key], authHeaders);
  const url = urls[key];
  if (!url) {
    throw new Error('Could not resolve media URL.');
  }
  return url;
}

export async function buildMediaPlayerTracks(
  materials: Material[],
  authHeaders: Record<string, string>
): Promise<MediaPlayerTrack[]> {
  const playable = materials.filter((m) => m.fileKey && isPlayableAudioFile(m.fileKey));
  if (playable.length === 0) return [];

  const fileKeys = playable.map((m) => m.fileKey.trim());
  const urls = await getMediaDownloadUrls(fileKeys, authHeaders);

  return playable
    .filter((m) => urls[m.fileKey.trim()])
    .map((m) => ({
      src: urls[m.fileKey.trim()],
      title:
        formatDisplayTitle(m.title || m.fileKey?.split('/').pop() || '') || 'Okänd',
      materialId: m.materialId,
    }));
}

/** Stable queue identity — use materialIds, not presigned src URLs. */
export function hashTrackQueueKey(tracks: MediaPlayerTrack[]): string {
  const sig = tracks.map((t) => t.materialId ?? t.src).join('\0');
  let h = 0;
  for (let i = 0; i < sig.length; i += 1) {
    h = (Math.imul(31, h) + sig.charCodeAt(i)) | 0;
  }
  return `m${(h >>> 0).toString(36)}`;
}
