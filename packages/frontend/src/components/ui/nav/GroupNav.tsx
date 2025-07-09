import { NavLink } from "react-router-dom";
import styles from './GroupNav.module.scss';

export const GroupNav = () => {
  return (
    <nav className={styles.nav} data-tour="group-nav">
      <NavLink
        to="repertoires"
        end
        className={({ isActive }) =>
          [styles.navLink, isActive ? 'active' : ''].join(' ')
        }
        // Lägg till data-tour här
        data-tour="group-nav-repertoires"
      >
        Repertoar
      </NavLink>
       <NavLink
        to="practice"
        end
        className={({ isActive }) =>
          [styles.navLink, isActive ? 'active' : ''].join(' ')
        }
        data-tour="group-nav-practice"
      >
        Sjungupp!
      </NavLink>
      <NavLink
        to="concerts"
        className={({ isActive }) =>
          [styles.navLink, isActive ? 'active' : ''].join(' ')
        }
        data-tour="group-nav-concerts"
      >
        Konserter & repdatum
      </NavLink>
      <NavLink
        to="users"
        className={({ isActive }) =>
          [styles.navLink, isActive ? 'active' : ''].join(' ')
        }
        data-tour="group-nav-users"
      >
        Användare
      </NavLink>
      <NavLink
        to="attendance"
        className={({ isActive }) =>
          [styles.navLink, isActive ? 'active' : ''].join(' ')
        }
        data-tour="group-nav-attendance"
      >
        Närvaro
      </NavLink>
    </nav>
  );
};