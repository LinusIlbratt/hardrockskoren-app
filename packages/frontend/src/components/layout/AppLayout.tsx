import { memo, useCallback, useEffect, useRef, useState, type RefCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { FavoritesProvider } from '@/context/FavoritesContext';
import { MusicPlayerOverlayProvider, useMusicPlayerOverlay } from '@/context/MusicPlayerOverlayContext';
import { MusicPlayerOverlayHost } from '@/components/music/MusicPlayerOverlay';
import { MiniPlayerBar } from '@/components/media/MiniPlayerBar';
import { MainNav } from '../ui/nav/MainNav';
import { PageLoader } from '@/components/ui/loader/Loader';
import styles from './AppLayout.module.scss';

const AppLayoutContent = memo(function AppLayoutContent() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [musicOverlayMount, setMusicOverlayMount] = useState<HTMLDivElement | null>(null);
  const { activeTrack, isOpen, activeGroupName, activeViewer, closeOverlay, closeSession } = useMusicPlayerOverlay();
  const location = useLocation();
  const isOpenRef = useRef(isOpen);
  const pushedMusicHistoryRef = useRef(false);

  const hasSession = Boolean(activeGroupName) && Boolean(activeViewer);
  const showMiniBar = Boolean(activeTrack) && !isOpen && hasSession;

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !pushedMusicHistoryRef.current) {
      window.history.pushState({ __hrkMusicOverlay: true }, '', window.location.href);
      pushedMusicHistoryRef.current = true;
      return;
    }

    if (!isOpen) {
      pushedMusicHistoryRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    const onPopState = () => {
      if (!isOpenRef.current) return;
      closeOverlay();
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [closeOverlay]);

  useEffect(() => {
    if (!activeGroupName || !activeViewer) return;

    const expectedPrefix =
      activeViewer === 'leader'
        ? `/leader/choir/${activeGroupName}`
        : activeViewer === 'admin'
          ? `/admin/groups/${activeGroupName}`
          : `/user/me/${activeGroupName}`;

    // Om användaren navigerar utanför körens vy (t.ex. tillbaka till översikt),
    // stäng musiksessionen för att undvika inkonsistent overlay-state.
    if (!location.pathname.startsWith(expectedPrefix)) {
      closeSession();
    }
  }, [activeGroupName, activeViewer, closeSession, location.pathname]);

  /** Måste vara stabil — annars tror React att ref byts varje render → detach/attach → setState i loop. */
  const setOverlayPortalRef = useCallback<RefCallback<HTMLDivElement>>((el) => {
    setMusicOverlayMount((prev) => (prev === el ? prev : el));
  }, []);

  return (
    <div className={styles.appLayout} data-mini-player-visible={showMiniBar ? 'true' : undefined}>
      <div className={styles.appBody}>
        <MainNav isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
        <main
          className={`${styles.mainContent} ${showMiniBar ? styles.mainWithMiniPlayer : ''}`}
        >
          <Outlet />
        </main>
      </div>
      {/* Monteringspunkt för musik-overlay: pekare passerar när minispelare (inte fullskärm). */}
      <div
        ref={setOverlayPortalRef}
        className={styles.musicOverlayPortal}
        data-music-fullscreen={isOpen ? 'true' : 'false'}
        aria-hidden={!isOpen}
        inert={hasSession && !isOpen ? true : undefined}
      />
      <MusicPlayerOverlayHost mountEl={musicOverlayMount} />
      <div className={styles.miniPlayerChrome}>
        <MiniPlayerBar />
      </div>
    </div>
  );
});

export const AppLayout = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <FavoritesProvider>
      <MusicPlayerOverlayProvider>
        <AppLayoutContent />
      </MusicPlayerOverlayProvider>
    </FavoritesProvider>
  );
};
