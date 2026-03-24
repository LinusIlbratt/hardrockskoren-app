import { useState } from 'react';
import {
  FaPlay,
  FaPause,
  FaVolumeUp,
  FaStepBackward,
  FaStepForward,
} from 'react-icons/fa';
import { Repeat, Repeat1, Heart, ListPlus, Maximize2 } from 'lucide-react';
import {
  useMusicPlayerOverlay,
  useMusicPlayerPlaybackProgress,
} from '@/context/MusicPlayerOverlayContext';
import { useFavorites } from '@/hooks/useFavorites';
import { AddToPlaylistModal } from '@/components/music/AddToPlaylistModal';
import { TrackTitleMarquee } from '@/components/media/TrackTitleMarquee';
import styles from './MediaPlayer.module.scss';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function formatTime(time: number): string {
  if (Number.isNaN(time)) return '0:00';
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

/**
 * Samma layout och SCSS som inbäddad MediaPlayer (playerBar), medan ljudet styrs av dold MediaPlayer via playbackApiRef.
 */
export function MiniPlayerBar() {
  const {
    isOpen,
    activeGroupName,
    activeViewer,
    activeTrack,
    isPlaying,
    playbackApiRef,
    expandOverlay,
    queueMeta,
    repeatMode,
    volume,
    playbackRate,
    activeMaterialId,
  } = useMusicPlayerOverlay();
  const playbackProgress = useMusicPlayerPlaybackProgress();

  const api = () => playbackApiRef.current;

  const { favoriteMaterialIds, toggleFavoriteOptimistic } = useFavorites();
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);

  const visible =
    Boolean(activeTrack) && !isOpen && Boolean(activeGroupName) && Boolean(activeViewer);

  if (!visible || !activeTrack) {
    return null;
  }

  const track = activeTrack;
  const { current, duration } = playbackProgress;

  const showPrevNext = Boolean(queueMeta && queueMeta.total > 1);
  const repeatAriaLabel =
    repeatMode === 'one'
      ? 'Upprepa ett spår (på)'
      : repeatMode === 'all'
        ? 'Upprepa alla (på)'
        : 'Upprepa av';

  return (
    <div
      role="region"
      aria-label="Miniuppspelare"
      className={`${styles.playerContainer} ${styles.miniPlayerBarDock}`}
    >
      <div className={styles.playerBar}>
        <div className={styles.sectionNowPlaying}>
          <div className={styles.artPlaceholder} aria-hidden>
            {(track.title || '?').charAt(0).toUpperCase()}
          </div>
          <div className={styles.nowPlayingMain}>
            <div className={styles.nowPlayingText}>
              <TrackTitleMarquee text={track.title || '—'} />
              {track.artist ? (
                <span className={styles.trackMeta}>{track.artist}</span>
              ) : showPrevNext && queueMeta ? (
                <span className={styles.trackMeta}>
                  Spår {queueMeta.currentIndex + 1} av {queueMeta.total}
                </span>
              ) : null}
            </div>
            {activeMaterialId ? (
              <div className={styles.quickActions}>
                <button
                  type="button"
                  className={styles.quickActionButton}
                  onClick={() => toggleFavoriteOptimistic(activeMaterialId)}
                  aria-label={
                    favoriteMaterialIds.includes(activeMaterialId)
                      ? 'Ta bort från favoriter'
                      : 'Lägg till i favoriter'
                  }
                  aria-pressed={favoriteMaterialIds.includes(activeMaterialId)}
                >
                  <Heart
                    size={18}
                    fill={
                      favoriteMaterialIds.includes(activeMaterialId)
                        ? 'currentColor'
                        : 'none'
                    }
                  />
                </button>
                <button
                  type="button"
                  className={styles.quickActionButton}
                  onClick={() => setPlaylistModalOpen(true)}
                  aria-label="Lägg till i spellista"
                >
                  <ListPlus size={18} aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.sectionTransport}>
          <div className={styles.transportButtons}>
            {showPrevNext && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => api()?.goPrevious()}
                disabled={!queueMeta || queueMeta.currentIndex <= 0}
                aria-label="Föregående spår"
              >
                <FaStepBackward size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => api()?.togglePlayPause()}
              className={styles.playPauseButton}
              aria-label={isPlaying ? 'Paus' : 'Spela'}
            >
              {isPlaying ? (
                <FaPause size={16} />
              ) : (
                <FaPlay size={16} style={{ marginLeft: 2 }} />
              )}
            </button>
            {showPrevNext && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => api()?.goNext()}
                disabled={
                  !queueMeta ||
                  (repeatMode !== 'all' && queueMeta.currentIndex >= queueMeta.total - 1)
                }
                aria-label="Nästa spår"
              >
                <FaStepForward size={14} />
              </button>
            )}
            <button
              type="button"
              className={`${styles.iconButton} ${repeatMode !== 'off' ? styles.iconButtonAccent : ''}`}
              onClick={() => api()?.cycleRepeat()}
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
                onChange={(e) => api()?.setPlaybackRate(Number(e.target.value))}
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
          <div className={styles.seekBarContainer}>
            <span className={styles.time}>{formatTime(current)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={current}
              onChange={(e) => api()?.seek(Number(e.target.value))}
              className={styles.timelineSlider}
              aria-label="Tidslinje"
            />
            <span className={styles.time}>{formatTime(duration)}</span>
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
              onChange={(e) => api()?.setVolume(Number(e.target.value))}
              className={styles.volumeSlider}
              aria-label="Volym"
            />
          </div>
          <button
            type="button"
            className={styles.expandFullButton}
            onClick={() => expandOverlay()}
            aria-label="Öppna fullskärmsmusik"
          >
            <Maximize2 size={20} aria-hidden />
          </button>
        </div>
      </div>

      <AddToPlaylistModal
        isOpen={playlistModalOpen}
        onClose={() => setPlaylistModalOpen(false)}
        materialId={playlistModalOpen ? activeMaterialId : null}
      />
    </div>
  );
}
