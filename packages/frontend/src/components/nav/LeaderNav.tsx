// src/components/ui/nav/LeaderNav.tsx

import { NavLink, useParams } from "react-router-dom";
import styles from './GroupNav.module.scss';
import { useAuth } from "@/context/AuthContext";
import { useMessageUnread } from "@/hooks/useMessageUnread";

export const LeaderNav = () => {
  const { user } = useAuth();
  const { groupName } = useParams<{ groupName: string }>();
  const { unreadStatus } = useMessageUnread();

  const getLinkClassName = ({ isActive }: { isActive: boolean }) => 
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  if (!groupName) {
    return null;
  }

  const base = `/leader/choir/${groupName}`;

  return (
    <nav className={styles.nav} data-tour="leader-nav">
      <NavLink to={`${base}/repertoires`} end className={getLinkClassName}>Repertoar</NavLink>
      <NavLink to={`${base}/aktuellt`} className={getLinkClassName}>
        Aktuellt
        {unreadStatus.hasUnread && (
          <span className={styles.badge} aria-label="Olästa meddelanden" />
        )}
      </NavLink>
      <NavLink to={`${base}/concerts`} className={getLinkClassName}>
        Gig & Repdatum
      </NavLink>

      <NavLink to={`${base}/practice`} className={getLinkClassName}>Sjungupp!</NavLink>
      {user?.role === 'admin' && (<NavLink to={`${base}/users`} className={getLinkClassName}>Användare</NavLink>)}
      <NavLink to={`${base}/attendance`} className={getLinkClassName}>Närvaro</NavLink>
    </nav>
  );
};
