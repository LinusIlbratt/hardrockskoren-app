import { memo, useCallback, useEffect, useRef, useState, type RefCallback } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useChoirDisplayName } from '@/features/groups/useChoirDisplayName';
import { FavoritesProvider } from '@/context/FavoritesContext';
import { MusicPlayerOverlayProvider, useMusicPlayerOverlay } from '@/context/MusicPlayerOverlayContext';
import { MusicPlayerOverlayHost } from '@/components/music/MusicPlayerOverlay';
import { MiniPlayerBar } from '@/components/media/MiniPlayerBar';
import { MainNav } from '../nav/MainNav';
import { ChoirNav, type ChoirAudience } from '../nav/ChoirNav';
import { RolePreviewBanner } from '@/components/auth/RolePreviewBanner';
import { GroupNotificationProviders } from '@/context/GroupNotificationProviders';
import { PageLoader } from '@/components/ui/loader/Loader';
import { choirSlugFromPath } from '@/utils/rolePreview';
import styles from './AppLayout.module.scss';

function choirFromPath(pathname: string): { slug: string; audience: ChoirAudience } | null {
  const slug = choirSlugFromPath(pathname);
  if (!slug) return null;
  if (pathname.startsWith('/admin/groups/')) return { slug, audience: 'admin' };
  if (pathname.startsWith('/leader/choir/')) return { slug, audience: 'leader' };
  if (pathname.startsWith('/user/me/')) return { slug, audience: 'member' };
  return null;
}

const AppLayoutContent = memo(function AppLayoutContent() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [musicOverlayMount, setMusicOverlayMount] = useState<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const { activeTrack, isOpen, activeGroupName, activeViewer, closeOverlay, closeSession } = useMusicPlayerOverlay();
  const location = useLocation();
  const isOpenRef = useRef(isOpen);
  const pushedMusicHistoryRef = useRef(false);

  const hasSession = Boolean(activeGroupName) && Boolean(activeViewer);
  const showMiniBar = Boolean(activeTrack) && !isOpen && hasSession;
  const choir = choirFromPath(location.pathname);
  const { name: choirName, isLoading: isChoirNameLoading } = useChoirDisplayName(choir?.slug);
  const hasSeveralChoirs = (user?.groups?.length ?? 0) > 1;
  const showBackToChoirs = choir?.audience === 'admin' || hasSeveralChoirs;
  const backToChoirs = choir?.audience === 'admin' ? '/admin/groups' : '/select-group';

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

  const topNav = choir ? (
    <div className={styles.choirTopStack}>
      <MainNav
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        withMemberTabs
      />
      <div className={styles.choirChrome}>
        <div className={styles.topBar}>
          {showBackToChoirs ? (
            <Link to={backToChoirs} className={styles.backLink}>
              ← Tillbaka till körer
            </Link>
          ) : (
            <span className={styles.identityName}>
              {user?.given_name} {user?.family_name}
            </span>
          )}
          <div className={styles.choirBadge} aria-busy={isChoirNameLoading}>
            {isChoirNameLoading ? (
              <span className={styles.nameSkeleton} aria-hidden="true" />
            ) : (
              choirName ?? ""
            )}
          </div>
        </div>
        <ChoirNav
          groupName={choir.slug}
          audience={choir.audience}
          showChoirName={false}
          embedded
        />
      </div>
    </div>
  ) : (
    <MainNav isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
  );

  const page = (
    <main
      className={`${styles.mainContent} ${showMiniBar ? styles.mainWithMiniPlayer : ''}`}
    >
      <Outlet />
    </main>
  );

  return (
    <div
      className={`${styles.appLayout} ${choir ? styles.withChoirTabs : ''}`}
      data-mini-player-visible={showMiniBar ? 'true' : undefined}
    >
      <RolePreviewBanner />
      <div className={styles.appBody}>
        {choir ? (
          <GroupNotificationProviders groupSlug={choir.slug}>
            {topNav}
            {page}
          </GroupNotificationProviders>
        ) : (
          <>
            {topNav}
            {page}
          </>
        )}
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
