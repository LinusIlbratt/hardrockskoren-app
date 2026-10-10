import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { MediaPlayerTrack } from '@/features/music-player/types';
import { readStoredProgress } from '@/features/music-player/hooks/useAudioEngine';

export type RepeatMode = 'off' | 'all' | 'one';

/** Motorkontroller som tangentbordet läser vid nedslag, inte när lyssnaren binds. */
export interface TrackQueueEngineControls {
  audioRef: RefObject<HTMLAudioElement | null>;
  togglePlayPauseRef: RefObject<() => void>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
  setVolume: Dispatch<SetStateAction<number>>;
  durationRef: RefObject<number>;
}

export interface UseTrackQueueParams {
  tracks: MediaPlayerTrack[] | null;
  queueMode: boolean;
  initialIndex: number;
  /** Tangentbord av när overlayn är minimerad. */
  isMinimized: boolean;
  keyboardEnabled: boolean;
  autoAdvance: boolean;
  onIndexChange?: (index: number) => void;
  pendingSeekRef: MutableRefObject<number | null>;
  persistProgressKey?: string;
  queueSignature: string;
  queueSigHash: string;
  engineRef: RefObject<TrackQueueEngineControls | null>;
  singleTitle: string;
  singleSrc: string;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(0, index), length - 1);
}

/**
 * Spellistekö, repeat och fönsterkortkommandon.
 * Index återställs innan useAudioEngine binder lyssnare, så pending seek hinner sättas.
 */
export function useTrackQueue({
  tracks,
  queueMode,
  initialIndex,
  isMinimized,
  keyboardEnabled,
  autoAdvance,
  onIndexChange,
  pendingSeekRef,
  persistProgressKey,
  queueSignature,
  queueSigHash,
  engineRef,
  singleTitle,
  singleSrc,
}: UseTrackQueueParams) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const prevQueueSigRef = useRef<string | null>(null);
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  const safeInitial =
    queueMode && tracks?.length ? Math.min(initialIndex, tracks.length - 1) : 0;

  const appliedQueueSigRef = useRef<string | null>(null);
  const appliedInitialRef = useRef(safeInitial);
  if (queueMode && tracks?.length) {
    const queueUnchanged = appliedQueueSigRef.current === queueSignature;
    if (queueUnchanged && appliedInitialRef.current !== safeInitial) {
      appliedInitialRef.current = safeInitial;
      setCurrentIndex(safeInitial);
      pendingSeekRef.current = null;
    } else if (!queueUnchanged) {
      appliedQueueSigRef.current = queueSignature;
      appliedInitialRef.current = safeInitial;
    }
  }

  /**
   * Spårindex + seek från sessionStorage endast när kön byts (ny queueSignature).
   * Om samma kö men nytt initialIndex (t.ex. radklick) ska lagrat index inte skriva över valet.
   */
  useEffect(() => {
    if (!queueMode || !tracks?.length) {
      setCurrentIndex(0);
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
          idx = clampIndex(stored.trackIndex, tracks.length);
        }
        if (typeof stored.currentTime === 'number' && Number.isFinite(stored.currentTime)) {
          seek = stored.currentTime;
        }
      }
    }
    setCurrentIndex(idx);
    pendingSeekRef.current = seek;
  }, [queueSignature, queueMode, tracks, safeInitial, persistProgressKey, queueSigHash]);

  useEffect(() => {
    onIndexChangeRef.current?.(currentIndex);
  }, [currentIndex]);

  const goToIndex = useCallback(
    (index: number) => {
      if (!queueMode || !tracks?.length) {
        setCurrentIndex(0);
        return;
      }
      setCurrentIndex(clampIndex(index, tracks.length));
    },
    [queueMode, tracks],
  );

  const handlePrevious = useCallback(() => {
    if (!queueMode || !tracks?.length) return;
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, [queueMode, tracks?.length]);

  const handleNext = useCallback(() => {
    if (!queueMode || !tracks?.length) return;
    setCurrentIndex((i) => {
      if (repeatMode === 'all' && i >= tracks.length - 1) return 0;
      return Math.min(tracks.length - 1, i + 1);
    });
  }, [queueMode, tracks, repeatMode]);

  const onEnded = useCallback(
    (audio: HTMLAudioElement) => {
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
          setCurrentIndex((prev) => {
            if (prev >= tracks.length - 1) return 0;
            return prev + 1;
          });
          return;
        }
        setCurrentIndex((prev) => {
          if (!autoAdvance || prev >= tracks.length - 1) return prev;
          return prev + 1;
        });
        return;
      }

      if (repeatMode === 'one' || repeatMode === 'all') {
        audio.currentTime = 0;
        void audio.play();
      }
    },
    [queueMode, tracks, autoAdvance, repeatMode],
  );

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((m) => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'));
  }, []);

  const currentTrack = useMemo((): Pick<MediaPlayerTrack, 'title' | 'src'> | null => {
    if (queueMode && tracks?.length) {
      const t = tracks[currentIndex];
      return t ? { title: t.title, src: t.src } : null;
    }
    if (!queueMode) {
      return { title: singleTitle, src: singleSrc };
    }
    return null;
  }, [queueMode, tracks, currentIndex, singleTitle, singleSrc]);

  const handleNextRef = useRef(handleNext);
  const handlePreviousRef = useRef(handlePrevious);
  useEffect(() => {
    handleNextRef.current = handleNext;
    handlePreviousRef.current = handlePrevious;
  }, [handleNext, handlePrevious]);

  useEffect(() => {
    if (!keyboardEnabled || isMinimized) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      const engine = engineRef.current;
      const audio = engine?.audioRef.current ?? null;
      if (!audio && e.key !== ' ') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          engine?.togglePlayPauseRef.current();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (audio && engine) {
            audio.currentTime = Math.max(0, audio.currentTime - 5);
            engine.setCurrentTime(audio.currentTime);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (audio && engine && engine.durationRef.current > 0) {
            const d = engine.durationRef.current;
            audio.currentTime = Math.min(d, audio.currentTime + 5);
            engine.setCurrentTime(audio.currentTime);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          engine?.setVolume((v) => {
            const next = Math.min(1, Math.round((v + 0.1) * 100) / 100);
            if (engine.audioRef.current) engine.audioRef.current.volume = next;
            return next;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          engine?.setVolume((v) => {
            const next = Math.max(0, Math.round((v - 0.1) * 100) / 100);
            if (engine.audioRef.current) engine.audioRef.current.volume = next;
            return next;
          });
          break;
        case 'n':
        case 'N':
          if (queueMode && tracks && tracks.length > 1) {
            e.preventDefault();
            handleNextRef.current();
          }
          break;
        case 'p':
        case 'P':
          if (queueMode && tracks && tracks.length > 1) {
            e.preventDefault();
            handlePreviousRef.current();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keyboardEnabled, isMinimized, queueMode, tracks]);

  return {
    currentIndex,
    currentTrack,
    repeatMode,
    handleNext,
    handlePrevious,
    goToIndex,
    cycleRepeatMode,
    onEnded,
  };
}
