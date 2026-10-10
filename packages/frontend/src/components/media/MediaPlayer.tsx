import {
  useState,
  useRef,
  useEffect,
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
import { Cluster } from '@/components/ui/layout/Cluster';
import { useOptionalMusicPlayerOverlay } from '@/context/MusicPlayerOverlayContext';
import type { MediaPlayerTrack } from '@/features/music-player';
import { readStoredProgress, useAudioEngine } from '@/features/music-player/hooks/useAudioEngine';
import {
  useTrackQueue,
  type TrackQueueEngineControls,
} from '@/features/music-player/hooks/useTrackQueue';

export type { MediaPlayerTrack };

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

export const MediaPlayer = (props: MediaPlayerProps) => {
  const pendingSeekRef = useRef<number | null>(null);
  const engineRef = useRef<TrackQueueEngineControls | null>(null);

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

  const [isPlayerVisible, setIsPlayerVisible] = useState(true);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

  const queueMode = isQueueProps(props);
  const variant = props.variant ?? 'fixed';
  const isEmbedded = variant === 'embedded';
  const tracks = queueMode ? props.tracks : null;
  const autoAdvance =
    queueMode && props.autoAdvanceToNext !== false && (tracks?.length ?? 0) > 1;

  const persistProgressKey = props.persistProgressKey?.trim() || undefined;
  const enableKeyboardShortcuts = props.enableKeyboardShortcuts !== false;

  const queueSignature =
    queueMode && tracks?.length ? tracks.map((t) => t.src).join('\0') : !queueMode ? props.src : '';

  const queueSigHash = queueSignature ? hashQueueSignature(queueSignature) : '';

  const singleSrc = !queueMode && 'src' in props ? props.src : '';
  const singleTitle = !queueMode && 'title' in props ? props.title : '';

  const syncPlaybackToContextFlag = props.syncPlaybackToContext === true;
  const overlayIsMinimized =
    syncPlaybackToContextFlag && overlayPlayback && !overlayPlayback.isOpen;
  const syncPlayback = syncPlaybackToContextFlag && Boolean(overlayPlayback);

  const {
    currentIndex: currentTrackIndex,
    currentTrack,
    repeatMode,
    handleNext: goToNext,
    handlePrevious: goToPrevious,
    cycleRepeatMode,
    onEnded: onAudioEnded,
  } = useTrackQueue({
    tracks,
    queueMode,
    initialIndex: queueMode ? (props.initialTrackIndex ?? 0) : 0,
    isMinimized: Boolean(overlayIsMinimized),
    keyboardEnabled: enableKeyboardShortcuts,
    autoAdvance,
    onIndexChange: queueMode ? props.onTrackIndexChange : undefined,
    pendingSeekRef,
    persistProgressKey,
    queueSignature,
    queueSigHash,
    engineRef,
    singleTitle,
    singleSrc,
  });

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

  const audioSrc =
    queueMode && tracks?.length
      ? tracks[currentTrackIndex]?.src ?? ''
      : !queueMode
        ? props.src
        : '';

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
  }, [audioSrc]);

  const {
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
  } = useAudioEngine({
    audioSrc,
    displayTitle,
    mediaSessionTrackSrc: currentTrack?.src,
    queueMode,
    onNext: goToNext,
    onPrevious: goToPrevious,
    onEnded: onAudioEnded,
    cycleRepeat: cycleRepeatMode,
    syncPlayback,
    playbackApiRef: overlayPlaybackApiRef,
    playbackToggleRef: overlayPlaybackToggleRef,
    pendingSeekRef,
    persistProgressKey,
    queueSigHash,
    hasQueueTracks: Boolean(tracks?.length),
    currentTrackIndex,
    singleSrc,
  });

  engineRef.current = {
    audioRef,
    togglePlayPauseRef,
    setCurrentTime,
    setVolume,
    durationRef,
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

  const timelineProgressPct =
    duration > 0 && Number.isFinite(duration)
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;
  const timelineSliderStyle = {
    ['--slider-progress' as string]: `${timelineProgressPct}%`,
  } as CSSProperties;

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

  const pendingMaterialId =
    overlayPlayback?.repertoirePlaybackIntent?.type === 'fromMaterialId'
      ? overlayPlayback.repertoirePlaybackIntent.materialId
      : null;
  const holdTrackSync = Boolean(
    pendingMaterialId && currentMaterialId && currentMaterialId !== pendingMaterialId,
  );

  const repeatAriaLabel =
    repeatMode === 'one'
      ? 'Upprepa ett spår (på)'
      : repeatMode === 'all'
        ? 'Upprepa alla (på)'
        : 'Upprepa av';

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
    if (!syncPlayback || !overlaySetActiveTrack || holdTrackSync) return;
    const t = displayTitle || '';
    overlaySetActiveTrack(
      t ? { title: t, ...(activeTrackFileKey ? { fileKey: activeTrackFileKey } : {}) } : null,
    );
  }, [syncPlayback, overlaySetActiveTrack, displayTitle, activeTrackFileKey, holdTrackSync]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetIsPlaying || holdTrackSync) return;
    overlaySetIsPlaying(isPlaying);
  }, [syncPlayback, overlaySetIsPlaying, isPlaying, holdTrackSync]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetPlaybackProgress || holdTrackSync) return;
    overlaySetPlaybackProgress({
      current: currentTime,
      duration: Number.isFinite(duration) ? duration : 0,
    });
  }, [syncPlayback, overlaySetPlaybackProgress, currentTime, duration, holdTrackSync]);

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
    if (!syncPlayback || !overlaySetQueueMeta || holdTrackSync) return;
    if (!queueMode || !tracks?.length) {
      overlaySetQueueMeta(null);
      return;
    }
    overlaySetQueueMeta({
      currentIndex: currentTrackIndex,
      total: tracks.length,
    });
  }, [syncPlayback, overlaySetQueueMeta, queueMode, tracks, currentTrackIndex, holdTrackSync]);

  useEffect(() => {
    if (!syncPlayback || !overlaySetActiveMaterialId || holdTrackSync) return;
    overlaySetActiveMaterialId(currentMaterialId ?? null);
  }, [syncPlayback, overlaySetActiveMaterialId, currentMaterialId, holdTrackSync]);

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
              <Cluster
                className={styles.transportSideStart}
                justify="end"
                align="center"
                gap="sm"
                wrap={false}
              >
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
              </Cluster>
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
              <Cluster
                className={styles.transportSideEnd}
                justify="start"
                align="center"
                gap="sm"
              >
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
              </Cluster>
            </div>
          </div>

          <div className={styles.sectionMeta}>
            <Cluster
              className={styles.sectionVolume}
              justify="end"
              align="center"
              gap="sm"
              wrap={false}
            >
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
            </Cluster>
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
