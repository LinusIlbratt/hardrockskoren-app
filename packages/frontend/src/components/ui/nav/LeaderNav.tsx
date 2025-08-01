// src/components/ui/nav/LeaderNav.tsx

import { NavLink } from "react-router-dom";
import styles from './GroupNav.module.scss';
import { useAuth } from "@/context/AuthContext"; // STEG 1: Importera useAuth

export const LeaderNav = () => {
  // STEG 2: Hämta användaren från context
  const { user } = useAuth(); 

  const getLinkClassName = ({ isActive }: { isActive: boolean }) => 
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  return (
    <nav className={styles.nav} data-tour="leader-nav">
      <NavLink to="repertoires" end className={getLinkClassName} data-tour="leader-repertoire-link">
        Repertoar
      </NavLink>

      <NavLink to="concerts" className={getLinkClassName} data-tour="leader-concerts-link">
        Konserter & Repdatum
      </NavLink>

      <NavLink to="practice" className={getLinkClassName} data-tour="leader-practice-link">
        Sjungupp!
      </NavLink>

      {/* STEG 3: Lägg till villkor för att bara visa för admin */}
      {user?.role === 'admin' && (
        <NavLink to="users" className={getLinkClassName} data-tour="leader-users-link">
          Användare
        </NavLink>
      )}
    
      <NavLink to="attendance" className={getLinkClassName} data-tour="leader-attendance-link">
        Närvaro
      </NavLink>
    </nav>
  );
};