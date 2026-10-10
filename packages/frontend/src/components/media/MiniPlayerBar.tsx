import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import {
  useMusicPlayerOverlay,
  useMusicPlayerPlaybackProgress,
} from '@/context/MusicPlayerOverlayContext';
import { formatDisplayTitle } from '@/utils/media';
import styles from './MediaPlayer.module.scss';

/**
 * Kompakt bottenlist. Ljudet styrs av dold MediaPlayer via playbackApiRef.
 * Klick på listen (utanför play) fäller upp overlayn.
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
  } = useMusicPlayerOverlay();
  const playbackProgress = useMusicPlayerPlaybackProgress();

  const visible =
    Boolean(activeTrack) && !isOpen && Boolean(activeGroupName) && Boolean(activeViewer);

  if (!visible || !activeTrack) {
    return null;
  }

  const track = activeTrack;
  const displayTitle =
    formatDisplayTitle(track.title || '') || track.title?.trim() || '—';
  const { current, duration } = playbackProgress;
  const progressPct =
    duration > 0 && Number.isFinite(duration)
      ? Math.min(100, Math.max(0, (current / duration) * 100))
      : 0;
  const subtitle =
    track.artist?.trim() ||
    (queueMeta && queueMeta.total > 1
      ? `Spår ${queueMeta.currentIndex + 1} av ${queueMeta.total}`
      : '');
  const hasPrevious = Boolean(queueMeta && queueMeta.currentIndex > 0);
  const hasNext = Boolean(
    queueMeta &&
      (repeatMode === 'all' || queueMeta.currentIndex < queueMeta.total - 1)
  );

  return (
    <div
      role="region"
      aria-label="Miniuppspelare"
      className={`${styles.playerContainer} ${styles.miniPlayerBarDock}`}
      onClick={() => expandOverlay()}
    >
      <div className={styles.miniProgressTrack} aria-hidden>
        <div className={styles.miniProgressFill} style={{ width: `${progressPct}%` }} />
      </div>

      <div className={styles.artPlaceholder} aria-hidden>
        {(displayTitle || '?').charAt(0).toUpperCase()}
      </div>

      <div className={styles.miniMeta}>
        <span className={styles.miniTitle}>{displayTitle}</span>
        {subtitle ? <span className={styles.miniSubtitle}>{subtitle}</span> : null}
      </div>

      <div className={styles.miniActions}>
        {hasPrevious ? (
          <button
            type="button"
            className={styles.miniControl}
            onClick={(event) => {
              event.stopPropagation();
              playbackApiRef.current?.goPrevious();
            }}
            aria-label="Föregående spår"
          >
            <SkipBack size={18} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          className={styles.miniControl}
          onClick={(event) => {
            event.stopPropagation();
            playbackApiRef.current?.togglePlayPause();
          }}
          aria-label={isPlaying ? 'Paus' : 'Spela'}
        >
          {isPlaying ? (
            <Pause size={18} aria-hidden />
          ) : (
            <Play size={18} aria-hidden style={{ marginLeft: 2 }} />
          )}
        </button>
        {hasNext ? (
          <button
            type="button"
            className={styles.miniControl}
            onClick={(event) => {
              event.stopPropagation();
              playbackApiRef.current?.goNext();
            }}
            aria-label="Nästa spår"
          >
            <SkipForward size={18} aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
