import { NavLink } from "react-router-dom";
import styles from './UserNav.module.scss';

export const UserNav = () => {
  return (
    <nav className={styles.nav}>
      {/* Notera att 'to'-sökvägen nu bara är den sista delen,
          eftersom den är relativ till sin förälder-route */}      
      <NavLink to="userMaterial" className={styles.navLink}>Material</NavLink>
      <NavLink to="userSing" className={styles.navLink}>Sjung upp</NavLink>
      <NavLink to="userDates" end className={styles.navLink}>Datum & tider </NavLink>
    </nav>
  );
};