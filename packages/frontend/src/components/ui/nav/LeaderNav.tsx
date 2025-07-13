import { NavLink } from "react-router-dom"; // Importera useParams
import styles from './GroupNav.module.scss'; // Antar att du återanvänder denna stil

export const LeaderNav = () => {

  const getLinkClassName = ({ isActive }: { isActive: boolean }) => 
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  return (
    <nav className={styles.nav}data-tour="leader-nav">
      {/* Dessa sökvägar är nu relativa till /leader/choir/:groupName */}

      <NavLink to="repertoires" end className={getLinkClassName} data-tour="leader-repertoire-link">
        Repertoar
      </NavLink>

      <NavLink to="concerts" className={getLinkClassName} data-tour="leader-concerts-link">
        Konserter & Repdatum
      </NavLink>

      <NavLink to="practice" className={getLinkClassName} data-tour="leader-practice-link">
        Sjungupp!
      </NavLink>

      <NavLink to="users" className={getLinkClassName} data-tour="leader-users-link">
        Användare
      </NavLink>

      <NavLink to="attendance" className={getLinkClassName}data-tour="leader-attendance-link">
        Närvaro
      </NavLink>
    </nav>
  );
};