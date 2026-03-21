import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  useMusicPlayerOverlay,
  type MusicPlayerViewer,
} from '@/context/MusicPlayerOverlayContext';
import { RepertoireMusicPlayerPanel } from '@/pages/member/RepertoireMusicPlayerPanel';
import styles from './MusicPlayerOverlay.module.scss';

const MAIN_NAV_OFFSET_PX = 50;

interface MusicPlayerOverlayProps {
  groupName: string;
  viewer: MusicPlayerViewer;
  onClose: () => void;
}

/**
 * Fullskärmslik musik-upplevelse ovanpå nuvarande sida (under MainNav).
 */
export function MusicPlayerOverlay({ groupName, viewer, onClose }: MusicPlayerOverlayProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const focusable = el.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();
  }, []);

  const node = (
    <div
      className={styles.root}
      style={{ top: MAIN_NAV_OFFSET_PX }}
      role="presentation"
    >
      <button
        type="button"
        className={styles.scrim}
        aria-label="Stäng musik (samma som Esc)"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <RepertoireMusicPlayerPanel
          groupName={groupName}
          viewer={viewer}
          onClose={onClose}
          shellTitleId={titleId}
        />
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

/** Montera i AppLayout (inuti MusicPlayerOverlayProvider). */
export function MusicPlayerOverlayHost() {
  const { isOpen, activeGroupName, activeViewer, close } = useMusicPlayerOverlay();
  if (!isOpen || !activeGroupName || !activeViewer) {
    return null;
  }
  return (
    <MusicPlayerOverlay
      groupName={activeGroupName}
      viewer={activeViewer}
      onClose={close}
    />
  );
}
