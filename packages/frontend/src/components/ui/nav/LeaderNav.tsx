// src/components/ui/nav/LeaderNav.tsx

import { NavLink, useParams } from "react-router-dom";
import styles from './GroupNav.module.scss';
import { useAuth } from "@/context/AuthContext";
import { useMusicPlayerOverlay } from "@/context/MusicPlayerOverlayContext";

export const LeaderNav = () => {
  const { user } = useAuth();
  const { groupName } = useParams<{ groupName: string }>();
  const { open: openMusic, isOpen: musicOpen, activeGroupName } = useMusicPlayerOverlay();

  const getLinkClassName = ({ isActive }: { isActive: boolean }) => 
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  if (!groupName) {
    return null;
  }

  const base = `/leader/choir/${groupName}`;
  const musicTabActive = Boolean(
    groupName && musicOpen && activeGroupName === groupName
  );

  return (
    <nav className={styles.nav} data-tour="leader-nav">
      <NavLink to={`${base}/repertoires`} end className={getLinkClassName}>Repertoar</NavLink>
      <button
        type="button"
        className={musicTabActive ? `${styles.navLink} ${styles.active}` : styles.navLink}
        onClick={() => groupName && openMusic(groupName, 'leader')}
      >
        Musik
      </button>
      <NavLink to={`${base}/concerts`} className={getLinkClassName}>
        Konserter & Repdatum
      </NavLink>

      <NavLink to={`${base}/practice`} className={getLinkClassName}>Sjungupp!</NavLink>
      {user?.role === 'admin' && (<NavLink to={`${base}/users`} className={getLinkClassName}>Användare</NavLink>)}
      <NavLink to={`${base}/attendance`} className={getLinkClassName}>Närvaro</NavLink>
    </nav>
  );
};