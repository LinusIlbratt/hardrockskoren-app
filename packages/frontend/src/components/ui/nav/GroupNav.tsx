import { NavLink } from "react-router-dom";
import styles from './GroupNav.module.scss';

export const GroupNav = () => {
  return (
    <nav className={styles.nav}>
      {/* Notera att 'to'-sökvägen nu bara är den sista delen,
          eftersom den är relativ till sin förälder-route */}
      <NavLink to="content" className={styles.navLink}>Material</NavLink>
      <NavLink to="repetoar" className={styles.navLink}>Repetoar</NavLink>
      <NavLink to="concerts" className={styles.navLink}>Konserter & repdatum</NavLink>
      <NavLink to="users" className={styles.navLink}>Användare</NavLink>
    </nav>
  );
};