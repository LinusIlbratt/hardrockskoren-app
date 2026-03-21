// src/components/ui/nav/UserNav.tsx

import { NavLink } from "react-router-dom";
import styles from './UserNav.module.scss';
import { useEventNotification } from "@/hooks/useEventNotification";
import { useMusicPlayerOverlay } from "@/context/MusicPlayerOverlayContext";

interface UserNavProps {
  groupName: string | undefined;
}

export const UserNav = ({ groupName }: UserNavProps) => {
  const { notificationData } = useEventNotification(groupName);
  const { open: openMusic, isOpen: musicOpen, activeGroupName } = useMusicPlayerOverlay();

  if (!groupName) {
    return null;
  }

  const getLinkClassName = ({ isActive }: { isActive: boolean }) => 
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  // STEG 2: Ta bort den gamla handleConcertsLinkClick. Den behövs inte i det nya systemet.

  // STEG 3: Uppdatera beräkningen för att använda det nya 'updatedEvents'-objektet.
  const totalNotifications = 
    notificationData.newEventIds.length + 
    Object.keys(notificationData.updatedEvents).length;

  const base = `/user/me/${groupName}`;
  const musicTabActive = musicOpen && activeGroupName === groupName;

  return (
    <nav className={styles.nav}>
      <NavLink to={`${base}/repertoires`} className={getLinkClassName}>Material</NavLink>
      <button
        type="button"
        className={musicTabActive ? `${styles.navLink} ${styles.active}` : styles.navLink}
        onClick={() => openMusic(groupName, 'member')}
      >
        Musik
      </button>
      <NavLink to={`${base}/practice`} className={getLinkClassName}>Sjung upp</NavLink>
      <NavLink 
        to={`${base}/concerts`}
        end 
        className={getLinkClassName}
        // STEG 4: Ta bort onClick. Länkens enda syfte är nu att navigera.
      >
        Konsert & Repdatum
        {notificationData.hasNotification && totalNotifications > 0 && (
          <span className={styles.badge}>
            {totalNotifications}
          </span>
        )}
      </NavLink>
    </nav>
  );
};