import { NavLink } from "react-router-dom"; // Importera useParams
import styles from './GroupNav.module.scss'; // Antar att du återanvänder denna stil

export const LeaderNav = () => {
  // Vi kan hämta groupName här om vi vill bygga mer komplexa länkar,
  // men för relativa länkar behövs det inte.
  // const { groupName } = useParams();

  return (
    <nav className={styles.nav}>
      {/* Dessa sökvägar är nu relativa till /leader/choir/:groupName */}

      <NavLink to="repertoires" end className={styles.navLink}>
        Repertoar
      </NavLink>

      <NavLink to="concerts" className={styles.navLink}>
        Konserter & Repdatum
      </NavLink>

      <NavLink to="practice" className={styles.navLink}>
        Sjungupp!
      </NavLink>

      <NavLink to="users" className={styles.navLink}>
        Användare
      </NavLink>

      <NavLink to="attendance" className={styles.navLink}>
        Närvaro
      </NavLink>
    </nav>
  );
};