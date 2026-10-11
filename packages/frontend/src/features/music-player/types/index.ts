/** Ett spår i kön. `src` är en presignerad URL och ingår inte i kö-identiteten. */
export interface MediaPlayerTrack {
  src: string;
  title: string;
  /** För favorit / spellista i spelaren */
  materialId?: string;
}

export type Track = MediaPlayerTrack;

/**
 * Imperativ styrning av samma MediaPlayer som är dold i miniläge.
 * Fylls i på playbackApiRef; implementationen ligger kvar i MediaPlayer.
 */
export interface MusicPlaybackApi {
  togglePlayPause: () => void;
  /** Maps to MediaPlayer goToPrevious */
  goPrevious: () => void;
  /** Maps to MediaPlayer goToNext */
  goNext: () => void;
  cycleRepeat: () => void;
  seek: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (v: number) => void;
}

export type PlaybackApi = MusicPlaybackApi;
