import { Play } from 'lucide-react';
import { useMusicPlayerOverlay } from '@/context/MusicPlayerOverlayContext';
import { useRecentlyPlayed } from '@/hooks/useRecentlyPlayed';
import { entryToResumePayload } from '@/utils/recentPlayback';
import styles from './RecentlyPlayedWidget.module.scss';

export interface RecentlyPlayedWidgetProps {
  groupName: string | undefined;
}

/**
 * Visar senaste spår för kören (localStorage) eller en "Utforska musik"-CTA.
 */
export function RecentlyPlayedWidget({ groupName }: RecentlyPlayedWidgetProps) {
  const entry = useRecentlyPlayed(groupName);
  const {
    open: openMusicOverlay,
    expandOverlay,
    isOpen,
    activeGroupName,
    activeViewer,
  } = useMusicPlayerOverlay();

  const g = groupName?.trim();
  if (!g) return null;

  const hasRecent = Boolean(entry && entryToResumePayload(entry));

  const resume = entry ? entryToResumePayload(entry) : null;

  const handleCardClick = () => {
    if (activeGroupName === g && activeViewer === 'member' && !isOpen) {
      expandOverlay();
      return;
    }
    if (hasRecent && resume) {
      openMusicOverlay(g, 'member', { playbackIntent: 'browse', resume });
    } else {
      openMusicOverlay(g, 'member', { playbackIntent: 'browse' });
    }
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasRecent && resume) {
      if (resume.source === 'repertoire') {
        openMusicOverlay(g, 'member', {
          startMinimized: true,
          initialRepertoireId: resume.repertoireId,
          playbackIntent: { type: 'fromMaterialId', materialId: resume.materialId },
        });
      } else {
        openMusicOverlay(g, 'member', {
          startMinimized: true,
          initialPlaylistId: resume.playlistId,
          playbackIntent: { type: 'fromMaterialId', materialId: resume.materialId },
        });
      }
    } else {
      openMusicOverlay(g, 'member', { startMinimized: true, playbackIntent: 'playAll' });
    }
  };

  return (
    <div className={styles.container}>
      <div className={`${styles.card} ${!hasRecent ? styles.discover : ''}`}>
        <div
          role="button"
          tabIndex={0}
          className={styles.body}
          onClick={handleCardClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick();
            }
          }}
          aria-label={
            hasRecent
              ? `Visa spårlista och repertoar för: ${entry?.title ?? ''}`
              : 'Visa musikspelaren och repertoar'
          }
        >
          <p className={styles.kicker}>
            {hasRecent ? 'Senast spelat' : 'Musik'}
          </p>
          <h3 className={styles.title}>
            {hasRecent ? (entry?.title ?? '') : 'Utforska musik'}
          </h3>
          <p className={styles.subtitle}>
            {hasRecent
              ? entry?.kind === 'playlist'
                ? 'Spellista · tryck här för att visa listan'
                : 'Repertoar · tryck här för att visa listan'
              : 'Tryck här för att öppna och bläddra i repertoaren'}
          </p>
        </div>
        <div className={styles.playWrap}>
          <span className={styles.playLabel}>Lyssna</span>
          <button
            type="button"
            className={styles.playBtn}
            onClick={handlePlayClick}
            title={hasRecent ? 'Spela upp ljud' : 'Öppna spelaren för uppspelning'}
            aria-label={
              hasRecent
                ? `Spela upp: ${entry?.title ?? ''} (minimerad spelare)`
                : 'Öppna musikspelaren för uppspelning (minimerad vy)'
            }
          >
            <Play size={22} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
