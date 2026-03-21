/**
 * Uppspelningsbara ljudfiler i appen (repertoar, musikspelare m.m.).
 * Case-insensitive på filändelse.
 */
const AUDIO_EXT_REGEX = /\.(mp3|wav|m4a)$/i;

export function isPlayableAudioFile(fileKey: string | undefined): boolean {
  return Boolean(fileKey && AUDIO_EXT_REGEX.test(fileKey));
}
