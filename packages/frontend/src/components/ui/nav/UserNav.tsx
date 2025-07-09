import { NavLink } from "react-router-dom";
import styles from './UserNav.module.scss';

// 1. Definiera ett interface för de props komponenten ska ta emot.
interface UserNavProps {
  groupName: string | undefined;
}

// 2. Uppdatera komponenten så den accepterar props.
export const UserNav = ({ groupName }: UserNavProps) => {
  // 3. Om groupName av någon anledning inte finns (t.ex. vid laddning),
  //    rendera ingenting för att undvika trasiga länkar.
  if (!groupName) {
    return null;
  }

  return (
    <nav className={styles.nav}>
      {/* Dina relativa länkar fungerar perfekt. Eftersom denna nav-meny
        renderas inuti /user/me/:groupName-routen, kommer "repertoires"
        korrekt att leda till /user/me/ditt-kornamn/repertoires.
      */}      
      <NavLink to="repertoires" className={styles.navLink} data-tour="user-repertoires-link">Material</NavLink>
      <NavLink to="practice" className={styles.navLink} data-tour="user-practice-link">Sjung upp</NavLink>
      <NavLink to="concerts" end className={styles.navLink} data-tour="user-concerts-link">Konsert & Repdatum</NavLink>
    </nav>
  );
};
