import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import type { MusicPlaybackApi } from '@/features/music-player/types';

const PROGRESS_STORAGE_PREFIX = 'hrk-media-progress:';
const TIMEUPDATE_UI_MS = 200;
const PROGRESS_SAVE_MS = 1500;

interface StoredProgress {
  v: 1;
  qs: string;
  trackIndex: number;
  currentTime: number;
  singleSrc?: string;
}

export function readStoredProgress(key: string): StoredProgress | null {
  try {
    const raw = sessionStorage.getItem(`${PROGRESS_STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredProgress;
    if (data?.v !== 1 || typeof data.qs !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

function writeStoredProgress(key: string, data: StoredProgress): void {
  try {
    sessionStorage.setItem(`${PROGRESS_STORAGE_PREFIX}${key}`, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

export interface UseAudioEngineParams {
  audioSrc: string;
  displayTitle: string;
  /** Samma beroende som tidigare: currentTrack?.src, så MediaSession uppdateras vid källbyte. */
  mediaSessionTrackSrc?: string;
  queueMode: boolean;
  onNext: () => void;
  onPrevious: () => void;
  /** Köpolicy när <audio> når slutet. Elementet skickas in så repeat kan söka och spela om. */
  onEnded: (audio: HTMLAudioElement) => void;
  cycleRepeat: () => void;
  syncPlayback: boolean;
  playbackApiRef?: MutableRefObject<MusicPlaybackApi | null>;
  playbackToggleRef?: MutableRefObject<(() => void) | null>;
  /** Sätts av könsåterställning innan lyssnarna binds, så loadedmetadata hinner läsa seek. */
  pendingSeekRef: MutableRefObject<number | null>;
  persistProgressKey?: string;
  queueSigHash: string;
  hasQueueTracks: boolean;
  currentTrackIndex: number;
  singleSrc: string;
}

/**
 * HTML5-audio, MediaSession och den imperativa bryggan till miniplayern.
 * <audio key={audioSrc}> renderas av anroparen med ref och handlers som returneras här.
 */
export function useAudioEngine({
  audioSrc,
  displayTitle,
  mediaSessionTrackSrc,
  queueMode,
  onNext,
  onPrevious,
  onEnded,
  cycleRepeat,
  syncPlayback,
  playbackApiRef,
  playbackToggleRef,
  pendingSeekRef,
  persistProgressKey,
  queueSigHash,
  hasQueueTracks,
  currentTrackIndex,
  singleSrc,
}: UseAudioEngineParams) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastUiTickRef = useRef(0);
  const lastSaveRef = useRef(0);
  const togglePlayPauseRef = useRef<() => void>(() => {});
  const durationRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
  }, [audioSrc]);

  const persistCurrentProgress = useCallback(() => {
    if (!persistProgressKey || !audioRef.current) return;
    const audio = audioRef.current;
    const t = audio.currentTime;
    if (!Number.isFinite(t) || t < 0) return;

    if (queueMode && hasQueueTracks) {
      writeStoredProgress(persistProgressKey, {
        v: 1,
        qs: queueSigHash,
        trackIndex: currentTrackIndex,
        currentTime: t,
      });
    } else if (!queueMode && singleSrc) {
      writeStoredProgress(persistProgressKey, {
        v: 1,
        qs: queueSigHash,
        trackIndex: 0,
        currentTime: t,
        singleSrc,
      });
    }
  }, [
    persistProgressKey,
    queueSigHash,
    queueMode,
    hasQueueTracks,
    currentTrackIndex,
    singleSrc,
  ]);

  useEffect(() => {
    return () => {
      persistCurrentProgress();
    };
  }, [persistCurrentProgress]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, audioSrc]);

  const togglePlayPause = useCallback(() => {
    setLoadError(null);
    setIsPlaying((was) => {
      if (was) {
        audioRef.current?.pause();
        return false;
      }
      void audioRef.current
        ?.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          setLoadError('Uppspelning kunde inte startas.');
          setIsPlaying(false);
        });
      return false;
    });
  }, []);

  useEffect(() => {
    togglePlayPauseRef.current = togglePlayPause;
  }, [togglePlayPause]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const ms = navigator.mediaSession;

    ms.metadata = new MediaMetadata({
      title: displayTitle || 'Ljudspår',
      artist: 'Hårdrockskören',
    });

    ms.playbackState = isPlaying ? 'playing' : 'paused';

    ms.setActionHandler('play', () => {
      void audioRef.current?.play();
    });
    ms.setActionHandler('pause', () => {
      audioRef.current?.pause();
    });

    if (queueMode) {
      ms.setActionHandler('previoustrack', () => {
        onPrevious();
      });
      ms.setActionHandler('nexttrack', () => {
        onNext();
      });
    } else {
      ms.setActionHandler('previoustrack', null);
      ms.setActionHandler('nexttrack', null);
    }

    return () => {
      ms.metadata = null;
      ms.setActionHandler('play', null);
      ms.setActionHandler('pause', null);
      ms.setActionHandler('previoustrack', null);
      ms.setActionHandler('nexttrack', null);
    };
  }, [displayTitle, mediaSessionTrackSrc, isPlaying, queueMode, onPrevious, onNext]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
      if (pendingSeekRef.current != null) {
        const seek = pendingSeekRef.current;
        pendingSeekRef.current = null;
        if (Number.isFinite(seek) && seek >= 0 && seek < (audio.duration || Infinity)) {
          audio.currentTime = seek;
          setCurrentTime(seek);
        }
      }
    };

    const onTimeUpdate = () => {
      const now = performance.now();
      if (now - lastUiTickRef.current < TIMEUPDATE_UI_MS) return;
      lastUiTickRef.current = now;
      setCurrentTime(audio.currentTime);

      if (persistProgressKey && now - lastSaveRef.current >= PROGRESS_SAVE_MS) {
        lastSaveRef.current = now;
        persistCurrentProgress();
      }
    };

    const onError = () => {
      const code = audio.error?.code;
      let msg = 'Kunde inte spela upp ljudfilen.';
      if (code === MediaError.MEDIA_ERR_NETWORK) {
        msg = 'Nätverksfel vid uppspelning.';
      } else if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        msg = 'Ljudformatet stöds inte.';
      }
      setLoadError(msg);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('error', onError);
    };
  }, [audioSrc, persistProgressKey, persistCurrentProgress]);

  const handleAudioEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    onEnded(audio);
  }, [onEnded]);

  useEffect(() => {
    if (!syncPlayback || !playbackToggleRef) return;
    const ref = playbackToggleRef;
    ref.current = togglePlayPause;
    return () => {
      ref.current = null;
    };
  }, [syncPlayback, playbackToggleRef, togglePlayPause]);

  useLayoutEffect(() => {
    if (!syncPlayback || !playbackApiRef || !playbackToggleRef) return;
    const api: MusicPlaybackApi = {
      togglePlayPause,
      goPrevious: onPrevious,
      goNext: onNext,
      cycleRepeat,
      seek: (seconds: number) => {
        const a = audioRef.current;
        if (!a || !Number.isFinite(seconds)) return;
        const d = a.duration;
        const clamped =
          Number.isFinite(d) && d > 0 ? Math.max(0, Math.min(seconds, d)) : Math.max(0, seconds);
        a.currentTime = clamped;
        setCurrentTime(a.currentTime);
      },
      setPlaybackRate: (r: number) => {
        if (!Number.isFinite(r)) return;
        setPlaybackRate(r);
        if (audioRef.current) audioRef.current.playbackRate = r;
      },
      setVolume: (v: number) => {
        const nv = Math.max(0, Math.min(1, v));
        setVolume(nv);
        if (audioRef.current) audioRef.current.volume = nv;
      },
    };
    playbackApiRef.current = api;
    playbackToggleRef.current = togglePlayPause;
    return () => {
      playbackApiRef.current = null;
      playbackToggleRef.current = null;
    };
  }, [
    syncPlayback,
    playbackApiRef,
    playbackToggleRef,
    togglePlayPause,
    onPrevious,
    onNext,
    cycleRepeat,
  ]);

  return {
    audioRef,
    isPlaying,
    setIsPlaying,
    duration,
    currentTime,
    setCurrentTime,
    volume,
    setVolume,
    playbackRate,
    setPlaybackRate,
    loadError,
    setLoadError,
    togglePlayPause,
    togglePlayPauseRef,
    durationRef,
    persistCurrentProgress,
    handleAudioEnded,
  };
}
