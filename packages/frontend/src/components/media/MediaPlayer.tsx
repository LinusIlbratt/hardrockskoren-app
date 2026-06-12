import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  type CSSProperties,
} from 'react';
import styles from './MediaPlayer.module.scss';
import {
  FaPlay,
  FaPause,
  FaVolumeUp,
  FaChevronDown,
  FaChevronUp,
  FaStepBackward,
  FaStepForward,
} from 'react-icons/fa';
import { Repeat, Repeat1, Heart, ListPlus } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { extractFileKeyFromMediaUrl, formatDisplayTitle } from '@/utils/media';
import type { Material } from '@/types';
import { AddToPlaylistModal } from '@/components/music/AddToPlaylistModal';
import { TrackTitleMarquee } from '@/components/media/TrackTitleMarquee';
import {
  useOptionalMusicPlayerOverlay,
  type MusicPlaybackApi,
} from '@/context/MusicPlayerOverlayContext';

export interface MediaPlayerTrack {
  src: string;
  title: string;
  /** För favorit / spellista i spelaren */
  materialId?: string;
}

const PROGRESS_STORAGE_PREFIX = 'hrk-media-progress:';
const TIMEUPDATE_UI_MS = 200;
const PROGRESS_SAVE_MS = 1500;

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

type MediaPlayerCommon = {
  /** Sparar position i sessionStorage (samma nyckel = återuppta vid återbesök). */
  persistProgressKey?: string;
  /** Tangentbordsgenvägar (Space, pilar, n/p). Default true. */
  enableKeyboardShortcuts?: boolean;
  /** Synkar titel/uppspelning till MusicPlayerOverlayContext (miniplayer, samma audio-element). */
  syncPlaybackToContext?: boolean;
};

interface MediaPlayerPropsSingle extends MediaPlayerCommon {
  src: string;
  title: string;
  /** Kopplar favorit/spellista till enspårsläge */
  materialId?: string;
  tracks?: never;
  initialTrackIndex?: never;
  autoAdvanceToNext?: never;
  onTrackIndexChange?: never;
  /** `embedded` = inuti musik-vy (ingen fixed viewport, ingen minimer-knapp). Default `fixed`. */
  variant?: 'fixed' | 'embedded';
}

interface MediaPlayerPropsQueue extends MediaPlayerCommon {
  src?: never;
  title?: never;
  materialId?: never;
  tracks: MediaPlayerTrack[];
  initialTrackIndex?: number;
  autoAdvanceToNext?: boolean;
  onTrackIndexChange?: (index: number) => void;
  variant?: 'fixed' | 'embedded';
}

export type MediaPlayerProps = MediaPlayerPropsSingle | MediaPlayerPropsQueue;

function isQueueProps(props: MediaPlayerProps): props is MediaPlayerPropsQueue {
  return Array.isArray((props as MediaPlayerPropsQueue).tracks) && (props as MediaPlayerPropsQueue).tracks.length > 0;
}

function hashQueueSignature(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `q${(h >>> 0).toString(36)}`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

interface StoredProgress {
  v: 1;
  qs: string;
  trackIndex: number;
  currentTime: number;
  singleSrc?: string;
}

function readStoredProgress(key: string): StoredProgress | null {
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

export const MediaPlayer = (props: MediaPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastUiTickRef = useRef(0);
  const lastSaveRef = useRef(0);
  const pendingSeekRef = useRef<number | null>(null);
  const prevQueueSigRef = useRef<string | null>(null);
  const togglePlayPauseRef = useRef<() => void>(() => {});

  const { favoriteMaterialIds, toggleFavoriteOptimistic } = useFavorites();
  const overlayPlayback = useOptionalMusicPlayerOverlay();
  const overlayPlaybackToggleRef = overlayPlayback?.playbackToggleRef;
  const overlayPlaybackApiRef = overlayPlayback?.playbackApiRef;
  const overlaySetActiveTrack = overlayPlayback?.setActiveTrack;
  const overlaySetIsPlaying = overlayPlayback?.setIsPlaying;
  const overlaySetPlaybackProgress = overlayPlayback?.setPlaybackProgress;
  const overlaySetRepeatMode = overlayPlayback?.setRepeatMode;
  const overlaySetVolume = overlayPlayback?.setVolume;
  const overlaySetPlaybackRate = overlayPlayback?.setPlaybackRate;
  const overlaySetQueueMeta = overlayPlayback?.setQueueMeta;
  const overlaySetActiveMaterialId = overlayPlayback?.setActiveMaterialId;

  const [isPlaying, setIsPlaying] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlayerVisible, setIsPlayerVisible] = useState(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

  const onTrackIndexChangeRef = useRef<((index: number) => void) | undefined>(undefined);

  const queueMode = isQueueProps(props);
  const variant = props.variant ?? 'fixed';
  const isEmbedded = variant === 'embedded';
  const tracks = queueMode ? props.tracks : null;
  const autoAdvance =
    queueMode && props.autoAdvanceToNext !== false && (tracks?.length ?? 0) > 1;

  const persistProgressKey = props.persistProgressKey?.trim() || undefined;
  const enableKeyboardShortcuts = props.enableKeyboardShortcuts !== false;

  onTrackIndexChangeRef.current = queueMode ? props.onTrackIndexChange : undefined;

  const safeInitial = queueMode && tracks?.length
    ? Math.min(props.initialTrackIndex ?? 0, tracks.length - 1)
    : 0;

  const queueSignature =
    queueMode && tracks?.length ? tracks.map((t) => t.src).join('\0') : !queueMode ? props.src : '';

  const queueSigHash = queueSignature ? hashQueueSignature(queueSignature) : '';

  const singleSrc = !queueMode && 'src' in props ? props.src : '';

  /**
   * Spårindex + seek från sessionStorage endast när kön byts (ny queueSignature).
   * Om samma kö men nytt initialTrackIndex (t.ex. radklick) ska lagrat index inte skriva över valet.
   */
  useEffect(() => {
    if (!queueMode || !tracks?.length) {
      setCurrentTrackIndex(0);
      prevQueueSigRef.current = null;
      return;
    }
    const queueJustChanged = prevQueueSigRef.current !== queueSignature;
    prevQueueSigRef.current = queueSignature;

    let idx = safeInitial;
    let seek: number | null = null;
    if (persistProgressKey && queueSigHash && queueJustChanged) {
      const stored = readStoredProgress(persistProgressKey);
      if (stored && stored.qs === queueSigHash) {
        if (typeof stored.trackIndex === 'number') {
          idx = Math.min(Math.max(0, stored.trackIndex), tracks.length - 1);
        }
        if (typeof stored.currentTime === 'number' && Number.isFinite(stored.currentTime)) {
          seek = stored.currentTime;
        }
      }
    }
    setCurrentTrackIndex(idx);
    pendingSeekRef.current = seek;
  }, [queueSignature, queueMode, tracks, safeInitial, persistProgressKey, queueSigHash]);

  /** Enkelspår: återställ seek från lagring. */
  useEffect(() => {
    if (queueMode) return;
    if (!persistProgressKey || !singleSrc) {
      pendingSeekRef.current = null;
      return;
    }
    const stored = readStoredProgress(persistProgressKey);
    if (stored && stored.qs === queueSigHash && stored.singleSrc === singleSrc) {
      pendingSeekRef.current = stored.currentTime;
    } else {
      pendingSeekRef.current = null;
    }
  }, [queueMode, persistProgressKey, queueSigHash, singleSrc]);

  useEffect(() => {
    onTrackIndexChangeRef.current?.(currentTrackIndex);
  }, [currentTrackIndex]);

  const audioSrc =
    queueMode && tracks?.length
      ? tracks[currentTrackIndex]?.src ?? ''
      : !queueMode
        ? props.src
        : '';

  const currentTrack = useMemo((): Pick<MediaPlayerTrack, 'title' | 'src'> | null => {
    if (queueMode && tracks?.length) {
      const t = tracks[currentTrackIndex];
      return t ? { title: t.title, src: t.src } : null;
    }
    if (!queueMode && 'title' in props && 'src' in props) {
      return { title: props.title, src: props.src };
    }
    return null;
  }, [
    queueMode,
    tracks,
    currentTrackIndex,
    !queueMode && 'title' in props ? props.title : '',
    !queueMode && 'src' in props ? props.src : '',
  ]);

  const rawTrackTitle = useMemo(() => {
    if (queueMode && tracks?.length) {
      return tracks[currentTrackIndex]?.title ?? '';
    }
    if (!queueMode && 'title' in props) {
      return props.title;
    }
    return '';
  }, [
    queueMode,
    tracks,
    currentTrackIndex,
    !queueMode && 'title' in props ? props.title : '',
  ]);

  const displayTitle = useMemo(
    () => formatDisplayTitle(rawTrackTitle) || rawTrackTitle.trim(),
    [rawTrackTitle],
  );

  useEffect(() => {
    setIsPlayerVisible(true);
    setLoadError(null);
  }, [audioSrc]);

  const persistCurrentProgress = useCallback(() => {
    if (!persistProgressKey || !audioRef.current) return;
    const audio = audioRef.current;
    const t = audio.currentTime;
    if (!Number.isFinite(t) || t < 0) return;

    if (queueMode && tracks?.length) {
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
  }, [persistProgressKey, queueSigHash, queueMode, tracks, currentTrackIndex, singleSrc]);

  useEffect(() => {
    return () => {
      persistCurrentProgress();
    };
  }, [persistCurrentProgress]);

  const goToPrevious = useCallback(() => {
    if (!queueMode || !tracks?.length) return;
    setCurrentTrackIndex((i) => Math.max(0, i - 1));
  }, [queueMode, tracks?.length]);

  const goToNext = useCallback(() => {
    if (!queueMode || !tracks?.length) return;
    setCurrentTrackIndex((i) => {
      if (repeatMode === 'all' && i >= tracks.length - 1) return 0;
      return Math.min(tracks.length - 1, i + 1);
    });
  }, [queueMode, tracks, repeatMode]);

  const handleAudioEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (queueMode && tracks?.length) {
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      if (repeatMode === 'all') {
        if (tracks.length === 1) {
          audio.currentTime = 0;
          void audio.play();
          return;
        }
        setCurrentTrackIndex((prev) => {
          if (prev >= tracks.length - 1) return 0;
          return prev + 1;
        });
        return;
      }
      setCurrentTrackIndex((prev) => {
        if (!autoAdvance || prev >= tracks.length - 1) return prev;
        return prev + 1;
      });
      return;
    }

    if (repeatMode === 'one' || repeatMode === 'all') {
      audio.currentTime = 0;
      void audio.play();
    }
  }, [queueMode, tracks, autoAdvance, repeatMode]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((m) => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'));
  }, []);

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
        goToPrevious();
      });
      ms.setActionHandler('nexttrack', () => {
        goToNext();
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
  }, [
    displayTitle,
    currentTrack?.src,
    isPlaying,
    queueMode,
    goToPrevious,
    goToNext,
  ]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  };

  const handleTimeSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Number(e.target.value);
      setCurrentTime(Number(e.target.value));
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const timelineProgressPct =
    duration > 0 && Number.isFinite(duration)
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;
  const timelineSliderStyle = {
    ['--slider-progress' as string]: `${timelineProgressPct}%`,
  } as CSSProperties;

  const durationRef = useRef(0);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const goToNextRef = useRef(goToNext);
  const goToPreviousRef = useRef(goToPrevious);
  useEffect(() => {
    goToNextRef.current = goToNext;
    goToPreviousRef.current = goToPrevious;
  }, [goToNext, goToPrevious]);

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

  const syncPlaybackToContextFlag = props.syncPlaybackToContext === true;
  const overlayIsMinimized =
    syncPlaybackToContextFlag && overlayPlayback && !overlayPlayback.isOpen;

  useEffect(() => {
    if (!enableKeyboardShortcuts || overlayIsMinimized) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const audio = audioRef.current;
      if (!audio && e.key !== ' ') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPauseRef.current();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (audio) {
            audio.currentTime = Math.max(0, audio.currentTime - 5);
            setCurrentTime(audio.currentTime);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (audio && durationRef.current > 0) {
            const d = durationRef.current;
            audio.currentTime = Math.min(d, audio.currentTime + 5);
            setCurrentTime(audio.currentTime);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume((v) => {
            const next = Math.min(1, Math.round((v + 0.1) * 100) / 100);
            if (audioRef.current) audioRef.current.volume = next;
            return next;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((v) => {
            const next = Math.max(0, Math.round((v - 0.1) * 100) / 100);
            if (audioRef.current) audioRef.current.volume = next;
            return next;
          });
          break;
        case 'n':
        case 'N':
          if (queueMode && tracks && tracks.length > 1) {
            e.preventDefault();
            goToNextRef.current();
          }
          break;
        case 'p':
        case 'P':
          if (queueMode && tracks && tracks.length > 1) {
            e.preventDefault();
            goToPreviousRef.current();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enableKeyboardShortcuts, overlayIsMinimized, queueMode, tracks]);

  const playerClasses = [
    styles.playerContainer,
    isEmbedded ? styles.playerEmbedded : '',
    !isEmbedded && !isPlayerVisible ? styles.hidden : '',
  ]
    .filter(Boolean)
    .join(' ');
  const showPrevNext = queueMode && tracks && tracks.length > 1;

  const currentMaterialId =
    queueMode && tracks?.length
      ? tracks[currentTrackIndex]?.materialId
      : !queueMode && 'materialId' in props
        ? props.materialId
        : undefined;

  const repeatAriaLabel =
    repeatMode === 'one'
      ? 'Upprepa ett spår (på)'
      : repeatMode === 'all'
        ? 'Upprepa alla (på)'
        : 'Upprepa av';

  const syncPlayback = syncPlaybackToContextFlag && Boolean(overlayPlayback);

  useEffect(() => {
    if (!syncPlayback || !overlayPlaybackToggleRef) return;
    const ref = overlayPlaybackToggleRef;
    ref.current = togglePlayPause;
    return () => {
      ref.current = null;
    };
  }, [syncPlayback, overlayPlaybackToggleRef, togglePlayPause]);

  const singleSrcForFileKey = !queueMode && 'src' in props ? props.src : '';
  const activeTrackFileKey = useMemo(() => {
    if (queueMode && tracks?.length) {
      return extractFileKeyFromMediaUrl(tracks[currentTrackIndex]?.src);
    }
    return extractFileKeyFromMediaUrl(singleSrcForFileKey);
  }, [queueMode, tracks, currentTrackIndex, singleSrcForFileKey]);

  const materialHintForFavorite = useMemo((): Material | undefined => {
    if (!currentMaterialId || !activeTrackFileKey) return undefined;
    const t = displayTitle.trim();
    return {
      materialId: currentMaterialId,
      fileKey: activeTrackFileKey,
      ...(t ? { title: t } : {}),
    };
  }, [currentMaterialId, activeTrackFileKey, displayTitle]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetActiveTrack) return;
    const t = displayTitle || '';
    overlaySetActiveTrack(
      t ? { title: t, ...(activeTrackFileKey ? { fileKey: activeTrackFileKey } : {}) } : null,
    );
  }, [syncPlayback, overlaySetActiveTrack, displayTitle, activeTrackFileKey]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetIsPlaying) return;
    overlaySetIsPlaying(isPlaying);
  }, [syncPlayback, overlaySetIsPlaying, isPlaying]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetPlaybackProgress) return;
    overlaySetPlaybackProgress({
      current: currentTime,
      duration: Number.isFinite(duration) ? duration : 0,
    });
  }, [syncPlayback, overlaySetPlaybackProgress, currentTime, duration]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetRepeatMode) return;
    overlaySetRepeatMode(repeatMode);
  }, [syncPlayback, overlaySetRepeatMode, repeatMode]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetVolume) return;
    overlaySetVolume(volume);
  }, [syncPlayback, overlaySetVolume, volume]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetPlaybackRate) return;
    overlaySetPlaybackRate(playbackRate);
  }, [syncPlayback, overlaySetPlaybackRate, playbackRate]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetQueueMeta) return;
    if (!queueMode || !tracks?.length) {
      overlaySetQueueMeta(null);
      return;
    }
    overlaySetQueueMeta({
      currentIndex: currentTrackIndex,
      total: tracks.length,
    });
  }, [syncPlayback, overlaySetQueueMeta, queueMode, tracks, currentTrackIndex]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetActiveMaterialId) return;
    overlaySetActiveMaterialId(currentMaterialId ?? null);
  }, [syncPlayback, overlaySetActiveMaterialId, currentMaterialId]);

  useLayoutEffect(() => {
    if (!syncPlayback || !overlayPlaybackApiRef || !overlayPlaybackToggleRef) return;
    const api: MusicPlaybackApi = {
      togglePlayPause,
      goPrevious: goToPrevious,
      goNext: goToNext,
      cycleRepeat: cycleRepeatMode,
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
    overlayPlaybackApiRef.current = api;
    overlayPlaybackToggleRef.current = togglePlayPause;
    return () => {
      overlayPlaybackApiRef.current = null;
      overlayPlaybackToggleRef.current = null;
    };
  }, [
    syncPlayback,
    overlayPlaybackApiRef,
    overlayPlaybackToggleRef,
    togglePlayPause,
    goToPrevious,
    goToNext,
    cycleRepeatMode,
  ]);

  const handlePlaybackRateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const r = Number(e.target.value);
    if (Number.isFinite(r)) {
      setPlaybackRate(r);
      if (audioRef.current) {
        audioRef.current.playbackRate = r;
      }
    }
  };

  return (
    <div className={playerClasses}>
      <audio
        key={audioSrc}
        ref={audioRef}
        src={audioSrc || undefined}
        autoPlay={Boolean(audioSrc) && !loadError}
        onPlay={() => setIsPlaying(true)}
        onPause={() => {
          setIsPlaying(false);
          persistCurrentProgress();
        }}
        onEnded={handleAudioEnded}
      />

      {loadError && (
        <div className={styles.errorBanner} role="alert">
          <span>{loadError}</span>
          {showPrevNext && (
            <button
              type="button"
              className={styles.errorNextButton}
              onClick={() => {
                setLoadError(null);
                goToNext();
              }}
            >
              Nästa spår
            </button>
          )}
          <button
            type="button"
            className={styles.errorRetryButton}
            onClick={() => {
              setLoadError(null);
              void audioRef.current?.load();
              void audioRef.current?.play().catch(() => {
                setLoadError('Uppspelning misslyckades.');
              });
            }}
          >
            Försök igen
          </button>
        </div>
      )}

      {!isEmbedded && (
        <button
          type="button"
          className={styles.toggleButton}
          onClick={() => setIsPlayerVisible(!isPlayerVisible)}
          aria-label={isPlayerVisible ? 'Dölj spelare' : 'Visa spelare'}
        >
          {isPlayerVisible ? <FaChevronDown size={16} /> : <FaChevronUp size={16} />}
        </button>
      )}

      <div className={styles.playerBar}>
        <div className={styles.playerMainRow}>
          <div className={styles.sectionNowPlaying}>
            <div className={styles.artPlaceholder} aria-hidden>
              {(displayTitle || '?').charAt(0).toUpperCase()}
            </div>
            <div className={styles.nowPlayingMain}>
              <div className={styles.nowPlayingText}>
                <TrackTitleMarquee text={displayTitle || '—'} />
                {queueMode && tracks && tracks.length > 1 && (
                  <span className={styles.trackMeta}>
                    Spår {currentTrackIndex + 1} av {tracks.length}
                  </span>
                )}
              </div>
              {currentMaterialId ? (
                <div className={styles.quickActions}>
                  <button
                    type="button"
                    className={styles.quickActionButton}
                    onClick={() => {
                      const adding = !favoriteMaterialIds.includes(currentMaterialId);
                      toggleFavoriteOptimistic(
                        currentMaterialId,
                        adding ? materialHintForFavorite : undefined,
                      );
                    }}
                    aria-label={
                      favoriteMaterialIds.includes(currentMaterialId)
                        ? 'Ta bort från favoriter'
                        : 'Lägg till i favoriter'
                    }
                    aria-pressed={favoriteMaterialIds.includes(currentMaterialId)}
                  >
                    <Heart
                      size={18}
                      fill={
                        favoriteMaterialIds.includes(currentMaterialId)
                          ? 'currentColor'
                          : 'none'
                      }
                    />
                  </button>
                  <button
                    type="button"
                    className={styles.quickActionButton}
                    onClick={() => setShowPlaylistModal(true)}
                    aria-label="Lägg till i spellista"
                  >
                    <ListPlus size={18} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className={styles.sectionTransport}>
            <div className={styles.transportCluster}>
              <div className={styles.transportSideStart}>
                {showPrevNext ? (
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={goToPrevious}
                    disabled={currentTrackIndex <= 0}
                    aria-label="Föregående spår"
                  >
                    <FaStepBackward size={15} />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={togglePlayPause}
                className={styles.playPauseButton}
                aria-label={isPlaying ? 'Paus' : 'Spela'}
              >
                {isPlaying ? (
                  <FaPause size={18} />
                ) : (
                  <FaPlay size={18} style={{ marginLeft: 2 }} />
                )}
              </button>
              <div className={styles.transportSideEnd}>
                {showPrevNext ? (
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={goToNext}
                    disabled={
                      repeatMode !== 'all' &&
                      currentTrackIndex >= (tracks?.length ?? 0) - 1
                    }
                    aria-label="Nästa spår"
                  >
                    <FaStepForward size={15} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`${styles.iconButton} ${repeatMode !== 'off' ? styles.iconButtonAccent : ''}`}
                  onClick={cycleRepeatMode}
                  aria-label={repeatAriaLabel}
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 size={18} strokeWidth={2} />
                  ) : (
                    <Repeat size={18} strokeWidth={2} />
                  )}
                </button>
                <label className={styles.playbackRateInline}>
                  <span className={styles.srOnly}>Uppspelningshastighet</span>
                  <select
                    className={styles.playbackRateSelectInline}
                    value={playbackRate}
                    onChange={handlePlaybackRateChange}
                    aria-label="Uppspelningshastighet"
                  >
                    {PLAYBACK_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r === 1 ? '1×' : `${r}×`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className={styles.sectionMeta}>
            <div className={styles.sectionVolume}>
              <FaVolumeUp size={16} className={styles.volumeIcon} aria-hidden />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolumeChange}
                className={styles.volumeSlider}
                aria-label="Volym"
              />
            </div>
          </div>
        </div>

        <div className={styles.playerProgressRow}>
          <div className={styles.seekBarContainer}>
            <span className={styles.time}>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleTimeSliderChange}
              className={styles.timelineSlider}
              style={timelineSliderStyle}
              aria-label="Tidslinje"
            />
            <span className={styles.time}>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      <AddToPlaylistModal
        isOpen={showPlaylistModal}
        onClose={() => setShowPlaylistModal(false)}
        materialId={showPlaylistModal ? currentMaterialId ?? null : null}
      />
    </div>
  );
};
