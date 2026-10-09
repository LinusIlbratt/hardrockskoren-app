import type { Material } from '@/types';
import type { MediaPlayerTrack } from '@/features/music-player/types';
import { getMediaDownloadUrls } from '@/services/mediaUrlService';
import { formatDisplayTitle, isPlayableAudioFile } from '@/utils/media';

export async function buildMediaPlayerTracks(
  materials: Material[],
  authHeaders: Record<string, string>,
): Promise<MediaPlayerTrack[]> {
  const playable = materials.filter((m) => m.fileKey && isPlayableAudioFile(m.fileKey));
  if (playable.length === 0) return [];

  const fileKeys = playable.map((m) => m.fileKey.trim());
  const urls = await getMediaDownloadUrls(fileKeys, authHeaders);

  return playable
    .filter((m) => urls[m.fileKey.trim()])
    .map((m) => ({
      src: urls[m.fileKey.trim()],
      title: formatDisplayTitle(m.title || m.fileKey?.split('/').pop() || '') || 'Okänd',
      materialId: m.materialId,
    }));
}
