// src/components/ui/nav/MainNav.tsx
import { useState, useMemo } from 'react';
import { useNavigate, useLocation, NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button, ButtonVariant, ButtonSize, ButtonRadius } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { Input } from '@/components/ui/input/Input';
import styles from './MainNav.module.scss';
import { IoClose } from 'react-icons/io5';
import { RxHamburgerMenu } from "react-icons/rx";
import { FiGlobe } from 'react-icons/fi';
import { Calendar, FileText, Mail, Mic, Music, Music2 } from 'lucide-react';
import { useMusicPlayerOverlay, type MusicPlayerViewer } from '@/context/MusicPlayerOverlayContext';

function choirPlayerTarget(pathname: string): { groupName: string; viewer: MusicPlayerViewer } | null {
  const patterns: Array<{ re: RegExp; viewer: MusicPlayerViewer }> = [
    { re: /^\/user\/me\/([^/]+)/, viewer: 'member' },
    { re: /^\/leader\/choir\/([^/]+)/, viewer: 'leader' },
    { re: /^\/admin\/groups\/([^/]+)/, viewer: 'admin' },
  ];

  for (const { re, viewer } of patterns) {
    const match = pathname.match(re);
    if (!match?.[1]) continue;
    try {
      return { groupName: decodeURIComponent(match[1]), viewer };
    } catch {
      return { groupName: match[1], viewer };
    }
  }

  return null;
}
import logoImage from '@/assets/images/hrk-logo.webp';
import { useAttendance } from '@/hooks/useAttendance';
import { useRolePreview } from '@/hooks/useRolePreview';
import { translateRole } from '@/utils/translations';
import { AppTourProvider } from '@/tours/AppTourProvider';
import { createAdminMainNavMobileSteps } from '@/tours/admin/adminMainNavStepsMobile';
import { useCloseTourOnUserInteraction } from '@/hooks/useCloseTourOnUserInteraction';
import { useIsMobile } from '@/hooks/useIsMobile';

interface MainNavProps {
    isMenuOpen: boolean;
    setIsMenuOpen: (open: boolean) => void;
    /** Medlemsflikarna sitter under listen, så den egna underkanten tas bort. */
    withMemberTabs?: boolean;
  }
  
  export const MainNav = ({ isMenuOpen, setIsMenuOpen, withMemberTabs = false }: MainNavProps) => {
    const { user, logout } = useAuth();
    const { realRole, viewAsRole, switchTo } = useRolePreview();
    const navigate = useNavigate();
    const location = useLocation();
    const isMobile = useIsMobile();
    const {
      open: openMusicOverlay,
      expandOverlay,
      isOpen: isMusicOpen,
      activeGroupName,
      activeViewer,
    } = useMusicPlayerOverlay();
    const playerTarget = choirPlayerTarget(location.pathname);
  
    const [showMainNavTour, setShowMainNavTour] = useState(false);
  
    const mobileNavSteps = useMemo(() => {
      if (!user) return [];
      return createAdminMainNavMobileSteps(user.role);
    }, [user]);
  
    useCloseTourOnUserInteraction();
  
    const {
      isAttendanceModalOpen,
      setIsAttendanceModalOpen,
      code,
      setCode,
      isLoading,
      error,
      successMessage,
      openAttendanceModal,
      handleRegisterSubmit,
    } = useAttendance();
  
    const handleLogout = () => {
      logout();
      navigate('/login');
    };
  
    const handleLinkClick = () => {
      setIsMenuOpen(false);
    };

    const handleOpenMusicPlayer = () => {
      if (!playerTarget) return;
      if (
        activeGroupName === playerTarget.groupName &&
        activeViewer === playerTarget.viewer &&
        !isMusicOpen
      ) {
        expandOverlay();
      } else {
        openMusicOverlay(playerTarget.groupName, playerTarget.viewer, {
          playbackIntent: 'browse',
        });
      }
      setIsMenuOpen(false);
    };
    
    const handleHamburgerClick = () => {
      setIsMenuOpen(true);
      const tourKey = "main_nav_mobile_tour";
      const hasSeenTour = localStorage.getItem(`tour_seen_for_${tourKey}`);
      if (process.env.NODE_ENV === 'development' || !hasSeenTour) {
        setShowMainNavTour(true);
      }
    };
  
    const applyView = (role: 'leader' | 'user') => {
      setIsMenuOpen(false);
      switchTo(role);
    };

    const UserInfoAndLogout = () => (
      user && (
        <div className={styles.userInfo} data-tour="user-info-area">
          <div className={styles.userDetails}>
            <p className={styles.email}>{user.given_name} {user.family_name}</p>
            <p className={styles.role}>{translateRole(user.role)}</p>
          </div>
          {realRole === 'admin' && (
            <div className={styles.viewAs} role="group" aria-label="Visa som">
              <span className={styles.viewAsLabel}>Visa som</span>
              <div className={styles.viewAsButtons}>
                <button
                  type="button"
                  className={viewAsRole === 'user' ? `${styles.viewAsButton} ${styles.viewAsButtonActive}` : styles.viewAsButton}
                  aria-pressed={viewAsRole === 'user'}
                  onClick={() => applyView('user')}
                >
                  Medlem
                </button>
                <button
                  type="button"
                  className={viewAsRole === 'leader' ? `${styles.viewAsButton} ${styles.viewAsButtonActive}` : styles.viewAsButton}
                  aria-pressed={viewAsRole === 'leader'}
                  onClick={() => applyView('leader')}
                >
                  Körledare
                </button>
              </div>
            </div>
          )}
          <Button
            onClick={handleLogout}
            variant={ButtonVariant.Ghost}
            size={ButtonSize.Logout}
            radius={ButtonRadius.Small}
            className={styles.logoutButton}
          >
            Logga ut
          </Button>
        </div>
      )
    );
  
    const getNavLinkClassName = ({ isActive }: { isActive: boolean }) =>
      isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

    const getHeaderLinkClassName = ({ isActive }: { isActive: boolean }) =>
      isActive ? `${styles.headerLink} ${styles.active}` : styles.headerLink;

    const getDrawerLinkClassName = ({ isActive }: { isActive: boolean }) =>
      isActive ? `${styles.drawerLink} ${styles.drawerActive}` : styles.drawerLink;

    const MainNavLinks = (
      <>
        {user?.role === 'admin' && (
          <>
            <NavLink to="/admin/groups" className={getNavLinkClassName} onClick={handleLinkClick} data-tour="admin-groups-link">Körer</NavLink>
            <NavLink to="/admin/messages" className={getNavLinkClassName} onClick={handleLinkClick}>Meddelande</NavLink>
            <NavLink to="/admin/shared-concerts" className={getNavLinkClassName} onClick={handleLinkClick}>Gemensamma gig</NavLink>
            <NavLink to="/admin/globalMaterial" className={getNavLinkClassName} onClick={handleLinkClick} data-tour="admin-global-material-link">Material</NavLink>
            <NavLink to="/admin/practice" end className={getNavLinkClassName} onClick={handleLinkClick} data-tour="admin-practice-link">Sjungupp!</NavLink>
          </>
        )}
        {(user?.role === 'leader' || user?.role === 'user') && user.groups && user.groups.length > 0 && (
          user.groups.length === 1 ? (
            <NavLink
              to={user.role === 'leader' ? `/leader/choir/${user.groups[0]}` : `/user/me/${user.groups[0]}`}
              className={getNavLinkClassName}
              onClick={handleLinkClick}
            >
              Min Kör
            </NavLink>
          ) : (
            <NavLink to="/select-group" className={getNavLinkClassName} onClick={handleLinkClick}>
              Mina Körer
            </NavLink>
          )
        )}
      </>
    );
  
    const AttendanceButton = (
      <>
        {user?.role === 'user' && (
          <Button
            variant={ButtonVariant.Primary}
            onClick={() => {
              openAttendanceModal();
              handleLinkClick();
            }}
          >
            Anmäl närvaro
          </Button>
        )}
      </>
    );
  
    const DrawerNavLinks = (
      <>
        {user && (
          <p className={styles.sectionLabel}>Körer</p>
        )}
        {user?.role === 'admin' && (
          <NavLink to="/admin/groups" className={getDrawerLinkClassName} onClick={handleLinkClick} data-tour="admin-groups-link">
            <Music size={18} aria-hidden="true" />
            <span>Välj kör</span>
          </NavLink>
        )}
        {(user?.role === 'leader' || user?.role === 'user') && user.groups && user.groups.length > 0 && (
          user.groups.length === 1 ? (
            <NavLink
              to={user.role === 'leader' ? `/leader/choir/${user.groups[0]}` : `/user/me/${user.groups[0]}`}
              className={getDrawerLinkClassName}
              onClick={handleLinkClick}
            >
              <Music size={18} aria-hidden="true" />
              <span>Min kör</span>
            </NavLink>
          ) : (
            <NavLink to="/select-group" className={getDrawerLinkClassName} onClick={handleLinkClick}>
              <Music size={18} aria-hidden="true" />
              <span>Mina körer</span>
            </NavLink>
          )
        )}
        <NavLink to="/choirs" end className={getDrawerLinkClassName} onClick={handleLinkClick}>
          <FiGlobe size={18} aria-hidden="true" />
          <span>Alla körer</span>
        </NavLink>
        {playerTarget && (
          <button
            type="button"
            className={styles.drawerLink}
            onClick={handleOpenMusicPlayer}
          >
            <Music2 size={18} aria-hidden="true" />
            <span>Musikspelaren</span>
          </button>
        )}
        {user?.role === 'admin' && (
          <>
            <p className={styles.sectionLabel}>Administration</p>
            <NavLink to="/admin/messages" className={getDrawerLinkClassName} onClick={handleLinkClick}>
              <Mail size={18} aria-hidden="true" />
              <span>Meddelande</span>
            </NavLink>
            <NavLink to="/admin/shared-concerts" className={getDrawerLinkClassName} onClick={handleLinkClick}>
              <Calendar size={18} aria-hidden="true" />
              <span>Gemensamma gig</span>
            </NavLink>
            <NavLink to="/admin/globalMaterial" className={getDrawerLinkClassName} onClick={handleLinkClick} data-tour="admin-global-material-link">
              <FileText size={18} aria-hidden="true" />
              <span>Material</span>
            </NavLink>
            <NavLink to="/admin/practice" end className={getDrawerLinkClassName} onClick={handleLinkClick} data-tour="admin-practice-link">
              <Mic size={18} aria-hidden="true" />
              <span>Sjungupp!</span>
            </NavLink>
          </>
        )}
      </>
    );

    const AllChoirsLink = (
      <NavLink to="/choirs" end className={getHeaderLinkClassName} title="Visa alla körer" onClick={handleLinkClick}>
        <FiGlobe size={22} />
        <span>Alla körer</span>
      </NavLink>
    );

  return (
    <>
      <header
        className={`${styles.mainNav} ${withMemberTabs ? styles.withMemberTabs : ''}`}
        data-tour="main-navbar"
      >
        {/* --- DESKTOP LAYOUT --- */}
        {!isMobile && (
          <>
            <div className={styles.leftSection}>
              <div className={styles.logo}>
                <img src={logoImage} alt="Logo för Hårdrockskören" />
              </div>
              {/* ÄNDRING: Länkarna ligger nu här i desktop-vyn */}
              <nav className={styles.desktopNav}>
                {MainNavLinks}
              </nav>
            </div>

            <div className={styles.navActionsRight}>
              <div className={styles.choirActions}>
                {user?.role === 'user' && (
                  <div className={styles.desktopAttendanceButton}>
                    {AttendanceButton}
                  </div>
                )}
                {AllChoirsLink}
              </div>
              {user && (
                <>
                  <span className={styles.navDivider} aria-hidden="true" />
                  <div className={styles.desktopOnlyUserInfo}>
                    <UserInfoAndLogout />
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* --- MOBIL LAYOUT (Oförändrad) --- */}
        {isMobile && (
          <>
             <div className={styles.leftSection}>
              <div className={styles.logo}>
                <img src={logoImage} alt="Logo för Hårdrockskören" />
              </div>
            </div>
            
            <div className={styles.rightSection}>
              
              <button
                className={styles.hamburgerButton}
                onClick={handleHamburgerClick}
                aria-label="Öppna meny"
                data-tour="hamburger-menu-icon"
              >
                <RxHamburgerMenu size={28} />
              </button>
            </div>
          </>
        )}

        {/* MOBILMENY (SIDE-PANEL) (Oförändrad) */}
        {isMobile && isMenuOpen && (
          <AppTourProvider
            steps={mobileNavSteps}
            tourKey="main_nav_mobile_tour"
            defaultOpen={showMainNavTour}
            beforeClose={() => setShowMainNavTour(false)}
          >
            <nav className={`${styles.nav} ${styles.navOpen}`}>
              <button className={styles.navCloseButton} onClick={() => setIsMenuOpen(false)} aria-label="Stäng meny">
                <IoClose size={32} />
              </button>
              
              <div className={styles.navLinksContainer}>
                {DrawerNavLinks}
              </div>

              <div className={styles.navFooter}>
                <div className={styles.mobileAttendanceButton} data-tour="user-attendance-button">
                  {AttendanceButton}
                </div>
                <div className={styles.mobileOnlyUserInfo}>
                  <UserInfoAndLogout />
                </div>
              </div>
            </nav>
          </AppTourProvider>
        )}
      </header>

      {/* Modal för närvaro (Oförändrad) */}
      <Modal isOpen={isAttendanceModalOpen} onClose={() => setIsAttendanceModalOpen(false)} title="Anmäl din närvaro">
        {successMessage ? (
          <div className={styles.successContainer}>
            <p>{successMessage}</p>
            <Button onClick={() => setIsAttendanceModalOpen(false)}>Stäng</Button>
          </div>
        ) : (
          <form onSubmit={handleRegisterSubmit}>
            <p>Ange den fyrsiffriga koden från din körledare.</p>
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="1234"
              maxLength={4}
              required
              autoFocus
            />
            {error && <p className={styles.errorMessage}>{error}</p>}
            <div className={styles.buttonGroup} style={{ marginTop: '1rem' }}>
              <Button type="submit" variant={ButtonVariant.Primary} disabled={isLoading}>
                {isLoading ? 'Registrerar...' : 'Registrera närvaro'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
};