/**
 * Uppspelningsbara ljudfiler i appen (repertoar, musikspelare m.m.).
 * Case-insensitive på filändelse.
 */
const AUDIO_EXT_REGEX = /\.(mp3|wav|m4a)$/i;
const VIDEO_EXT_REGEX = /\.(mp4|mov|webm)$/i;
const PDF_TXT_EXT_REGEX = /\.(pdf|txt)$/i;

export function isPlayableAudioFile(fileKey: string | undefined): boolean {
  return Boolean(fileKey && AUDIO_EXT_REGEX.test(fileKey));
}

export function isVideoFile(fileKey: string | undefined): boolean {
  return Boolean(fileKey && VIDEO_EXT_REGEX.test(fileKey));
}

/** PDF eller ren text (noter / sångtext). */
export function isPdfOrTxtFile(fileKey: string | undefined): boolean {
  return Boolean(fileKey && PDF_TXT_EXT_REGEX.test(fileKey));
}

/**
 * Förhandsvisas i MediaModal (video, pdf, txt).
 * Ljud spelas via MediaPlayer – räknas inte som "view" här om man vill separera.
 */
export function isModalPreviewableFile(fileKey: string | undefined): boolean {
  return isVideoFile(fileKey) || isPdfOrTxtFile(fileKey);
}

export type MaterialFileCategory = 'audio' | 'video' | 'document' | 'other';

export function getMaterialFileCategory(fileKey: string | undefined): MaterialFileCategory {
  if (!fileKey) return 'other';
  if (isPlayableAudioFile(fileKey)) return 'audio';
  if (isVideoFile(fileKey)) return 'video';
  if (isPdfOrTxtFile(fileKey)) return 'document';
  return 'other';
}

/** Texter/noter som kan visas bredvid spelaren (pdf/txt). */
export function isSingAlongDocumentFile(fileKey: string | undefined): boolean {
  return isPdfOrTxtFile(fileKey);
}

/** Kort signatur för lista av media-URL:er (React keys m.m.). */
export function hashMediaSourcesKey(sources: string[]): string {
  const s = sources.join('\0');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `m${(h >>> 0).toString(36)}`;
}

/**
 * Derives S3 object key from a full media URL (matches how tracks use `VITE_S3_BUCKET_URL` + fileKey).
 */
export function extractFileKeyFromMediaUrl(src: string | undefined): string | undefined {
  const t = src?.trim();
  if (!t) return undefined;
  const base = (import.meta.env.VITE_S3_BUCKET_URL as string | undefined)?.replace(/\/$/, '') ?? '';
  if (base && t.startsWith(base)) {
    const key = t.slice(base.length).replace(/^\//, '');
    return key || undefined;
  }
  try {
    const path = new URL(t).pathname.replace(/^\//, '');
    return path || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Formats a raw filename or basename for UI: strips common audio extensions,
 * uses the last path segment, replaces underscores with spaces.
 */
export function formatDisplayTitle(filename: string): string {
  const s = filename.trim();
  if (!s) return '';
  const base = s.includes('/') ? (s.split('/').pop() ?? s) : s;
  const withoutExt = base.replace(AUDIO_EXT_REGEX, '');
  return withoutExt.replace(/_/g, ' ').trim();
}
