import { NavLink } from "react-router-dom";
import styles from './UserNav.module.scss';

interface UserNavProps {
  groupName: string | undefined;
}

export const UserNav = ({ groupName }: UserNavProps) => {
  if (!groupName) {
    return null;
  }

  // Denna funktion bestämmer vilka klasser som ska appliceras.
  // { isActive } är ett objekt som NavLink automatiskt skickar in.
  const getLinkClassName = ({ isActive }: { isActive: boolean }) => 
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  return (
    <nav className={styles.nav}>
      <NavLink to="repertoires" className={getLinkClassName} data-tour="user-repertoires-link">
        Material
      </NavLink>
      <NavLink to="practice" className={getLinkClassName} data-tour="user-practice-link">
        Sjung upp
      </NavLink>
      <NavLink to="concerts" end className={getLinkClassName} data-tour="user-concerts-link">
        Konsert & Repdatum
      </NavLink>
    </nav>
  );
};
