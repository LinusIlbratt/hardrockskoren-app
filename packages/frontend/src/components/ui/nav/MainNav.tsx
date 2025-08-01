// src/components/ui/nav/MainNav.tsx
import { useState, useMemo } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button, ButtonVariant, ButtonSize, ButtonRadius } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { Input } from '@/components/ui/input/Input';
import styles from './MainNav.module.scss';
import { IoClose } from 'react-icons/io5';
import { RxHamburgerMenu } from "react-icons/rx";
import { FiGlobe } from 'react-icons/fi';
import logoImage from '@/assets/images/hrk-logo.webp';
import { useAttendance } from '@/hooks/useAttendance';
import { translateRole } from '@/utils/translations';
import { AppTourProvider } from '@/tours/AppTourProvider';
import { createAdminMainNavMobileSteps } from '@/tours/admin/adminMainNavStepsMobile';
import { useCloseTourOnUserInteraction } from '@/hooks/useCloseTourOnUserInteraction';
import { useIsMobile } from '@/hooks/useIsMobile';

// ... (interface och all logik innan 'return' är oförändrad) ...

interface MainNavProps {
    isMenuOpen: boolean;
    setIsMenuOpen: (open: boolean) => void;
  }
  
  export const MainNav = ({ isMenuOpen, setIsMenuOpen }: MainNavProps) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const isMobile = useIsMobile();
  
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
    
    const handleHamburgerClick = () => {
      setIsMenuOpen(true);
      const tourKey = "main_nav_mobile_tour";
      const hasSeenTour = localStorage.getItem(`tour_seen_for_${tourKey}`);
      if (process.env.NODE_ENV === 'development' || !hasSeenTour) {
        setShowMainNavTour(true);
      }
    };
  
    const UserInfoAndLogout = () => (
      user && (
        <div className={styles.userInfo} data-tour="user-info-area">
          <div className={styles.userDetails}>
            <p className={styles.email}>{user.given_name} {user.family_name}</p>
            <p className={styles.role}>{translateRole(user.role)}</p>
          </div>
          <Button
            onClick={handleLogout}
            variant={ButtonVariant.Ghost}
            size={ButtonSize.Logout}
            radius={ButtonRadius.Small}
          >
            Logga ut
          </Button>
        </div>
      )
    );
  
    const MainNavLinks = (
      <>
        {user?.role === 'admin' && (
          <>
            <NavLink to="/admin/groups" className={styles.navLink} onClick={handleLinkClick}>Körer</NavLink>
            <NavLink to="/admin/globalMaterial" className={styles.navLink} onClick={handleLinkClick}>Material</NavLink>
            <NavLink to="/admin/practice" className={styles.navLink} onClick={handleLinkClick}>Sjungupp!</NavLink>
          </>
        )}
        {(user?.role === 'leader' || user?.role === 'user') && user.groups && user.groups.length > 0 && (
          user.groups.length === 1 ? (
            <NavLink
              to={user.role === 'leader' ? `/leader/choir/${user.groups[0]}` : `/user/me/${user.groups[0]}`}
              className={styles.navLink}
              onClick={handleLinkClick}
            >
              Min Kör
            </NavLink>
          ) : (
            <NavLink to="/select-group" className={styles.myChoir} onClick={handleLinkClick}>
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
  
    const AllChoirsLink = (
      <NavLink to="/choirs" className={styles.headerLink} title="Visa alla körer" onClick={handleLinkClick}>
        <FiGlobe size={22} />
        <span>Alla körer</span>
      </NavLink>
    );

  return (
    <>
      <header className={styles.mainNav} data-tour="main-navbar">
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

            <div className={styles.middleSection}>
              <div className={styles.desktopAttendanceButton}>
                {AttendanceButton}
              </div>
            </div>

            <div className={styles.rightSection}>
              {AllChoirsLink}
              <div className={styles.desktopOnlyUserInfo}>
                <UserInfoAndLogout />
              </div>
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
              <button className={styles.navCloseButton} onClick={() => setIsMenuOpen(false)}>
                <IoClose size={32} />
              </button>
              
              <div className={styles.navLinksContainer}>
                {MainNavLinks}
              </div>

              <div className={styles.navFooter}>
                <div className={styles.mobileAttendanceButton} data-tour="user-attendance-button">
                  {AttendanceButton}
                </div>
                {AllChoirsLink}
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