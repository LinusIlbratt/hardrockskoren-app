import { useState, useRef, useEffect, useCallback } from 'react';
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

export interface MediaPlayerTrack {
  src: string;
  title: string;
}

interface MediaPlayerPropsSingle {
  src: string;
  title: string;
  tracks?: never;
  initialTrackIndex?: never;
  autoAdvanceToNext?: never;
  onTrackIndexChange?: never;
  /** `embedded` = inuti musik-vy (ingen fixed viewport, ingen minimer-knapp). Default `fixed`. */
  variant?: 'fixed' | 'embedded';
}

interface MediaPlayerPropsQueue {
  src?: never;
  title?: never;
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

export const MediaPlayer = (props: MediaPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlayerVisible, setIsPlayerVisible] = useState(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [volume, setVolume] = useState(1);
  const onTrackIndexChangeRef = useRef<((index: number) => void) | undefined>(undefined);

  const queueMode = isQueueProps(props);
  const variant = props.variant ?? 'fixed';
  const isEmbedded = variant === 'embedded';
  const tracks = queueMode ? props.tracks : null;
  const autoAdvance =
    queueMode && props.autoAdvanceToNext !== false && (tracks?.length ?? 0) > 1;

  onTrackIndexChangeRef.current = queueMode ? props.onTrackIndexChange : undefined;

  const safeInitial = queueMode && tracks?.length
    ? Math.min(props.initialTrackIndex ?? 0, tracks.length - 1)
    : 0;

  const queueSignature = queueMode && tracks ? tracks.map((t) => t.src).join('|') : '';

  useEffect(() => {
    if (queueMode && tracks?.length) {
      setCurrentTrackIndex(safeInitial);
    }
  }, [queueSignature, queueMode, tracks?.length, safeInitial]);

  useEffect(() => {
    onTrackIndexChangeRef.current?.(currentTrackIndex);
  }, [currentTrackIndex]);

  const audioSrc =
    queueMode && tracks?.length
      ? tracks[currentTrackIndex]?.src ?? ''
      : !queueMode
        ? props.src
        : '';

  useEffect(() => {
    setIsPlayerVisible(true);
  }, [audioSrc]);

  const goToPrevious = useCallback(() => {
    if (!queueMode || !tracks?.length) return;
    setCurrentTrackIndex((i) => Math.max(0, i - 1));
  }, [queueMode, tracks?.length]);

  const goToNext = useCallback(() => {
    if (!queueMode || !tracks?.length) return;
    setCurrentTrackIndex((i) => Math.min(tracks.length - 1, i + 1));
  }, [queueMode, tracks]);

  useEffect(() => {
    if (!queueMode || !tracks?.length) return;
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      setCurrentTrackIndex((prev) => {
        if (!autoAdvance || prev >= tracks.length - 1) return prev;
        return prev + 1;
      });
    };
    audio.addEventListener('ended', handleEnded);
    return () => audio.removeEventListener('ended', handleEnded);
  }, [queueMode, tracks, autoAdvance, queueSignature]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlayPause = () => {
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      setDuration(audio.duration);
      setCurrentTime(audio.currentTime);
    };
    const updateCurrentTime = () => setCurrentTime(audio.currentTime);

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', updateCurrentTime);

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', updateCurrentTime);
    };
  }, [audioSrc]);

  const playerClasses = [
    styles.playerContainer,
    isEmbedded ? styles.playerEmbedded : '',
    !isEmbedded && !isPlayerVisible ? styles.hidden : '',
  ]
    .filter(Boolean)
    .join(' ');
  const showPrevNext = queueMode && tracks && tracks.length > 1;
  const title =
    queueMode && tracks?.length ? tracks[currentTrackIndex]?.title ?? '' : !queueMode ? props.title : '';

  return (
    <div className={playerClasses}>
      <audio
        key={audioSrc}
        ref={audioRef}
        src={audioSrc || undefined}
        autoPlay={Boolean(audioSrc)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

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
        <div className={styles.sectionNowPlaying}>
          <div className={styles.artPlaceholder} aria-hidden>
            {(title || '?').charAt(0).toUpperCase()}
          </div>
          <div className={styles.nowPlayingText}>
            <span className={styles.trackTitle}>{title || '—'}</span>
            {queueMode && tracks && tracks.length > 1 && (
              <span className={styles.trackMeta}>
                Spår {currentTrackIndex + 1} av {tracks.length}
              </span>
            )}
          </div>
        </div>

        <div className={styles.sectionTransport}>
          <div className={styles.transportButtons}>
            {showPrevNext && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={goToPrevious}
                disabled={currentTrackIndex <= 0}
                aria-label="Föregående spår"
              >
                <FaStepBackward size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={togglePlayPause}
              className={styles.playPauseButton}
              aria-label={isPlaying ? 'Paus' : 'Spela'}
            >
              {isPlaying ? <FaPause size={16} /> : <FaPlay size={16} style={{ marginLeft: 2 }} />}
            </button>
            {showPrevNext && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={goToNext}
                disabled={currentTrackIndex >= (tracks?.length ?? 0) - 1}
                aria-label="Nästa spår"
              >
                <FaStepForward size={14} />
              </button>
            )}
          </div>
          <div className={styles.seekBarContainer}>
            <span className={styles.time}>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={currentTime}
              onChange={handleTimeSliderChange}
              className={styles.timelineSlider}
              aria-label="Tidslinje"
            />
            <span className={styles.time}>{formatTime(duration)}</span>
          </div>
        </div>

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
  );
};
