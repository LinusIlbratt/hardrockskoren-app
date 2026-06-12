import { ChevronRight, Music } from 'lucide-react';
import {
  useMusicPlayerOverlay,
  type MusicPlayerViewer,
} from '@/context/MusicPlayerOverlayContext';
import styles from './RecentlyPlayedWidget.module.scss';

export interface RecentlyPlayedWidgetProps {
  groupName: string | undefined;
  /** Vilken vy som öppnar spelaren (styr länkar tillbaka till repertoar m.m.). */
  viewer?: MusicPlayerViewer;
}

/**
 * Kompakt CTA till musikspelaren (browse) — Spotify-lik rad med ikon-tile.
 */
export function RecentlyPlayedWidget({
  groupName,
  viewer = 'member',
}: RecentlyPlayedWidgetProps) {
  const {
    open: openMusicOverlay,
    expandOverlay,
    isOpen,
    activeGroupName,
    activeViewer,
  } = useMusicPlayerOverlay();

  const g = groupName?.trim();
  if (!g) return null;

  const handleOpen = () => {
    if (activeGroupName === g && activeViewer === viewer && !isOpen) {
      expandOverlay();
      return;
    }
    openMusicOverlay(g, viewer, { playbackIntent: 'browse' });
  };

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.card}
        onClick={handleOpen}
        aria-label="Öppna musikspelaren och bläddra i repertoaren"
      >
        <div className={styles.art} aria-hidden>
          <Music className={styles.artIcon} size={26} strokeWidth={1.75} />
        </div>
        <div className={styles.cardText}>
          <span className={styles.title}>Musikspelaren</span>
          <span className={styles.subtitle}>
            Här kan du göra din egen spellista att repa till.
          </span>
        </div>
        <ChevronRight
          className={styles.chevron}
          size={20}
          strokeWidth={2}
          aria-hidden
        />
      </button>
    </div>
  );
}
