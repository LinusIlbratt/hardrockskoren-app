import { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button, ButtonVariant, ButtonSize, ButtonRadius } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { Input } from '@/components/ui/input/Input';
import styles from './MainNav.module.scss';
import { IoClose } from 'react-icons/io5';
import { RxHamburgerMenu } from "react-icons/rx";
import logoImage from '@/assets/images/hrk-logo.webp';
import { useAttendance } from '@/hooks/useAttendance';
import { translateRole } from '@/utils/translations';

export const MainNav = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    // Använder den nya hooken för att hämta all logik för närvaro
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

    const UserInfoAndLogout = () => (
        user && (
            <div className={styles.userInfo}>
                <div className={styles.userDetails}>
                    <p className={styles.email}>{user.given_name} {user.family_name}</p>
                    <p className={styles.role}>{translateRole(user.role)}</p>
                    
                </div>
                <Button onClick={handleLogout} variant={ButtonVariant.Ghost} size={ButtonSize.Logout} radius={ButtonRadius.Small}>
                    Logga ut
                </Button>
            </div>
        )
    );

    return (
        <>
            <header className={styles.mainNav}>
                <div className={styles.logo}>
                    <img src={logoImage} alt="Logo för Hårdrockskören" />
                </div>          

                <nav className={`${styles.nav} ${isMenuOpen ? styles.navOpen : ''}`}>
                    <button className={styles.navCloseButton} onClick={() => setIsMenuOpen(false)}>
                        <IoClose size={32} />
                    </button>   

                    {user?.role === 'admin' && (
                        <>
                            <NavLink to="/admin/groups" className={styles.navLink} onClick={handleLinkClick}>Körer</NavLink>
                            <NavLink to="/admin/globalMaterial" className={styles.navLink} onClick={handleLinkClick}>Material</NavLink>
                            <NavLink to="/admin/practice" className={styles.navLink} onClick={handleLinkClick}>Sjungupp!</NavLink>
                        </>
                    )}
                    
                    {user?.role === 'user' && (
                        <div className={styles.mobileAttendanceButton}>
                            <Button 
                                variant={ButtonVariant.Primary}
                                onClick={() => {
                                    openAttendanceModal();
                                    handleLinkClick();
                                }}
                            >
                                Anmäl närvaro
                            </Button>
                        </div>
                    )}

                    <div className={styles.mobileOnlyUserInfo}>
                        <UserInfoAndLogout />
                    </div>
                </nav>

                

                <div className={styles.rightSection}>
                    <div className={styles.desktopOnlyUserInfo}>
                        <UserInfoAndLogout />
                    </div>
                    <button className={styles.hamburgerButton} onClick={() => setIsMenuOpen(true)} aria-label="Öppna meny">
                        <RxHamburgerMenu size={28} />
                    </button>
                </div>
            </header>
            
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
