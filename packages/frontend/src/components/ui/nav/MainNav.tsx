import { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button, ButtonVariant, ButtonSize, ButtonRadius } from '@/components/ui/button/Button';
import styles from './MainNav.module.scss';
import { IoClose } from 'react-icons/io5';
import { RxHamburgerMenu } from "react-icons/rx";
import logoImage from '@/assets/images/hrk-logo.webp';

export const MainNav = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleLinkClick = () => {
        setIsMenuOpen(false);
    }

    // En återanvändbar komponent för användarinfo för att undvika kodupprepning
    const UserInfoAndLogout = () => (
        user && (
            <div className={styles.userInfo}>
                <div className={styles.userDetails}>
                    <p className={styles.email}>{user.given_name} {user.family_name}</p>
                    <p className={styles.role}>{user.role}</p>
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

    return (
        <header className={styles.mainNav}>
            <div className={styles.logo}>
                <img src={logoImage} alt="Logo för Hårdrockskören" />
            </div>

            {/* Huvudnavigationen, som blir mobilmenyn */}
            <nav className={`${styles.nav} ${isMenuOpen ? styles.navOpen : ''}`}>
                <button className={styles.navCloseButton} onClick={() => setIsMenuOpen(false)}>
                    <IoClose size={32} />
                </button>   

                {/* --- HÄR ÄR DEN FULLSTÄNDIGA KODEN FÖR LÄNKARNA --- */}
                {user?.role === 'admin' && (
                    <>
                        <NavLink to="/admin/groups" className={styles.navLink} onClick={handleLinkClick}>Körer</NavLink>
                        <NavLink to="/admin/globalMaterial" className={styles.navLink} onClick={handleLinkClick}>Material</NavLink>
                        <NavLink to="/admin/practice" className={styles.navLink} onClick={handleLinkClick}>Sjungupp!</NavLink>
                    </>
                )}

             

                {/* Denna version av användarinfon visas bara i den öppna mobilmenyn */}
                <div className={styles.mobileOnlyUserInfo}>
                    <UserInfoAndLogout />
                </div>
            </nav>

            {/* Sektionen till höger i topp-baren */}
            <div className={styles.rightSection}>
                {/* Denna version visas bara på desktop */}
                <div className={styles.desktopOnlyUserInfo}>
                    <UserInfoAndLogout />
                </div>

                <button className={styles.hamburgerButton} onClick={() => setIsMenuOpen(true)} aria-label="Öppna meny">
                    <RxHamburgerMenu size={28} />
                </button>
            </div>
        </header>
    );
};