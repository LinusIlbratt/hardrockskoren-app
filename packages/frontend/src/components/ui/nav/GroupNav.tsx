import { NavLink } from "react-router-dom";
import styles from './GroupNav.module.scss';

export const GroupNav = () => {
  return (
    <nav className={styles.nav}>
      <NavLink
        to="repertoires"
        end
        className={({ isActive }) =>
          [styles.navLink, isActive ? 'active' : ''].join(' ')
        }
      >
        Repertoar
      </NavLink>
      <NavLink
        to="concerts"
        className={({ isActive }) =>
          [styles.navLink, isActive ? 'active' : ''].join(' ')
        }
      >
        Konserter & repdatum
      </NavLink>
      <NavLink
        to="users"
        className={({ isActive }) =>
          [styles.navLink, isActive ? 'active' : ''].join(' ')
        }
      >
        Användare
      </NavLink>
    </nav>
  );
};