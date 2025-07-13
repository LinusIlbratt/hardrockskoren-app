import { NavLink } from "react-router-dom";
import styles from './GroupNav.module.scss';

export const GroupNav = () => {
  // Hjälpfunktion för att dynamiskt sätta klassnamn
  const getLinkClassName = ({ isActive }: { isActive: boolean }) => 
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  return (
    <nav className={styles.nav} data-tour="group-nav">
      <NavLink
        to="repertoires"
        end
        className={getLinkClassName}
        data-tour="group-nav-repertoires"
      >
        Repertoar
      </NavLink>
       <NavLink
        to="practice"
        end
        className={getLinkClassName}
        data-tour="group-nav-practice"
      >
        Sjungupp!
      </NavLink>
      <NavLink
        to="concerts"
        className={getLinkClassName}
        data-tour="group-nav-concerts"
      >
        Konserter & repdatum
      </NavLink>
      <NavLink
        to="users"
        className={getLinkClassName}
        data-tour="group-nav-users"
      >
        Användare
      </NavLink>
      <NavLink
        to="attendance"
        className={getLinkClassName}
        data-tour="group-nav-attendance"
      >
        Närvaro
      </NavLink>
    </nav>
  );
};
