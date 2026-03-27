import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  useMusicPlayerOverlay,
  type LibraryPlaybackIntent,
  type MusicPlayerViewer,
  type RepertoirePlaybackIntent,
} from '@/context/MusicPlayerOverlayContext';
import { RepertoireMusicPlayerPanel } from '@/pages/member/RepertoireMusicPlayerPanel';
import { lockBodyScroll, unlockBodyScroll } from '@/utils/bodyScrollLock';
import type { Material } from '@/types';
import styles from './MusicPlayerOverlay.module.scss';

interface MusicPlayerOverlayProps {
  groupName: string;
  viewer: MusicPlayerViewer;
  /** När false: fullskärms-UI döljs men panelen (och MediaPlayer) monteras kvar för miniplayer. */
  overlayUiVisible: boolean;
  onCloseOverlay: () => void;
  onExitSession: () => void;
  libraryQueueMaterials?: Material[] | null;
  libraryPlaybackIntent?: LibraryPlaybackIntent | null;
  /** Sjung upp m.m.: bibliotekskö men repertoar-sidebar ska visas. */
  libraryPlaybackWithRepertoire?: boolean;
  initialRepertoireId?: string | null;
  initialPlaylistId?: string | null;
  repertoirePlaybackIntent?: RepertoirePlaybackIntent | null;
  /** Portal-mål (t.ex. AppLayout). Default document.body om null. */
  mountEl?: HTMLElement | null;
}

/**
 * Fullskärmslik musik-upplevelse ovanpå nuvarande sida (under MainNav).
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function MusicPlayerOverlay({
  groupName,
  viewer,
  overlayUiVisible,
  onCloseOverlay,
  onExitSession,
  libraryQueueMaterials,
  libraryPlaybackIntent,
  libraryPlaybackWithRepertoire = false,
  initialRepertoireId,
  initialPlaylistId,
  repertoirePlaybackIntent,
  mountEl,
}: MusicPlayerOverlayProps) {
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!overlayUiVisible) {
      unlockBodyScroll();
      return;
    }
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [overlayUiVisible]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseOverlay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCloseOverlay]);

  useEffect(() => {
    if (!overlayUiVisible) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const el = panelRef.current;
    if (!el) return;
    const focusable = el.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.focus();
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, [overlayUiVisible]);

  useEffect(() => {
    if (!overlayUiVisible) return;
    const root = containerRef.current;
    if (!root) return;

    const getFocusable = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

    const onTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const nodes = getFocusable();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    root.addEventListener('keydown', onTabKey);
    return () => root.removeEventListener('keydown', onTabKey);
  }, [overlayUiVisible]);

  const rootClassName = [styles.root, !overlayUiVisible ? styles.rootMinimized : '']
    .filter(Boolean)
    .join(' ');

  const node = (
    <div ref={containerRef} className={rootClassName} role="presentation">
      <button
        type="button"
        className={styles.scrim}
        aria-label="Stäng musik (samma som Esc)"
        onClick={onCloseOverlay}
        tabIndex={overlayUiVisible ? 0 : -1}
      />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={overlayUiVisible ? -1 : -1}
      >
        <RepertoireMusicPlayerPanel
          groupName={groupName}
          viewer={viewer}
          onMinimizeOverlay={onCloseOverlay}
          onExitSession={onExitSession}
          shellTitleId={titleId}
          libraryQueueMaterials={libraryQueueMaterials ?? null}
          libraryPlaybackIntent={libraryPlaybackIntent ?? null}
          libraryPlaybackWithRepertoire={libraryPlaybackWithRepertoire}
          initialRepertoireId={initialRepertoireId ?? null}
          initialPlaylistId={initialPlaylistId ?? null}
          repertoirePlaybackIntent={repertoirePlaybackIntent ?? null}
        />
      </div>
    </div>
  );

  return createPortal(node, mountEl ?? document.body);
}

/** Montera i AppLayout (inuti MusicPlayerOverlayProvider). Session kvar även när fullskärm är stängd (miniplayer). */
export function MusicPlayerOverlayHost({ mountEl }: { mountEl?: HTMLElement | null }) {
  const {
    isOpen,
    activeGroupName,
    activeViewer,
    closeOverlay,
    closeSession,
    libraryMaterials,
    libraryPlayback,
    libraryPlaybackWithRepertoire,
    initialRepertoireId,
    initialPlaylistId,
    repertoirePlaybackIntent,
  } = useMusicPlayerOverlay();

  if (!activeGroupName || !activeViewer) {
    return null;
  }

  return (
    <MusicPlayerOverlay
      groupName={activeGroupName}
      viewer={activeViewer}
      overlayUiVisible={isOpen}
      onCloseOverlay={closeOverlay}
      onExitSession={closeSession}
      libraryQueueMaterials={libraryMaterials ?? undefined}
      libraryPlaybackIntent={libraryPlayback ?? undefined}
      libraryPlaybackWithRepertoire={libraryPlaybackWithRepertoire}
      initialRepertoireId={initialRepertoireId ?? undefined}
      initialPlaylistId={initialPlaylistId ?? undefined}
      repertoirePlaybackIntent={repertoirePlaybackIntent ?? undefined}
      mountEl={mountEl}
    />
  );
}
