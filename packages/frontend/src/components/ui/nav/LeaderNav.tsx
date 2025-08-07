// src/components/ui/nav/LeaderNav.tsx

import { NavLink } from "react-router-dom";
import styles from './GroupNav.module.scss';
import { useAuth } from "@/context/AuthContext";

export const LeaderNav = (/* ta bort props här */) => {
  const { user } = useAuth();
  // ... Ta bort alla rader som har med useEventNotification och useParams att göra ...

  const getLinkClassName = ({ isActive }: { isActive: boolean }) => 
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  return (
    <nav className={styles.nav} data-tour="leader-nav">
      <NavLink to="repertoires" end className={getLinkClassName}>Repertoar</NavLink>

      <NavLink to="concerts" className={getLinkClassName}>
        Konserter & Repdatum
        {/* Badgen är nu borttagen härifrån */}
      </NavLink>

      <NavLink to="practice" className={getLinkClassName}>Sjungupp!</NavLink>
      {user?.role === 'admin' && (<NavLink to="users" className={getLinkClassName}>Användare</NavLink>)}
      <NavLink to="attendance" className={getLinkClassName}>Närvaro</NavLink>
    </nav>
  );
};