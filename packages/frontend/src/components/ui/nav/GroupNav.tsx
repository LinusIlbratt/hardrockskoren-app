import { NavLink } from "react-router-dom";
import styles from './GroupNav.module.scss';

export const GroupNav = () => {
  return (
    <nav className={styles.nav}>
      {/* Notera att 'to'-sökvägen nu bara är den sista delen,
          eftersom den är relativ till sin förälder-route */}      
      <NavLink to="repertoires" end className={styles.navLink}>Repertoar</NavLink>
      <NavLink to="users" className={styles.navLink}>Användare</NavLink>
      <NavLink to="overview" className={styles.navLink}>Översikt</NavLink>
    </nav>
  );
};