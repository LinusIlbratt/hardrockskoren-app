import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import styles from './MainNav.module.scss';

export const MainNav = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout(); // Anropar den centrala utloggningsfunktionen
        navigate('/login'); // Skickar användaren till loginsidan
    };

    return (
        <header className={styles.mainNav}>
            <div className={styles.logo}>
                {/* Här kan du lägga din logo */}
                <span style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-primary)' }}>HRK</span>
            </div>

            {user && (
                <div className={styles.userInfo}>
                    <div className={styles.userDetails}>
                        <p className={styles.email}>{user.given_name} {user.family_name}</p>
                        <p className={styles.role}>{user.role}</p>
                    </div>
                    <Button onClick={handleLogout} variant={ButtonVariant.Ghost}>
                        Logga ut
                    </Button>
                </div>
            )}
        </header>
    );
};