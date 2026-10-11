import axios from 'axios';

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

const CACHE_SAFETY_MS = 60_000;

function cacheSet(fileKey: string, url: string, expiresInSeconds: number): void {
  const lifetimeMs = Math.max(0, expiresInSeconds) * 1000;
  const ttlMs =
    lifetimeMs <= CACHE_SAFETY_MS
      ? lifetimeMs
      : Math.min(CACHE_TTL_MS, Math.max(CACHE_SAFETY_MS, lifetimeMs - CACHE_SAFETY_MS));
  if (ttlMs <= 0) return;
  urlCache.set(fileKey, { url, expiresAt: Date.now() + ttlMs });
}

export function clearMediaUrlCache(): void {
  urlCache.clear();
}

/**
 * Resolves presigned media URLs for in-app playback (audio, video, PDF viewer).
 * Not exposed as user-facing download links.
 */
export async function getMediaDownloadUrls(
  fileKeys: string[],
  authHeaders: Record<string, string>,
  signal?: AbortSignal,
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
      { headers: { ...authHeaders }, signal },
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
