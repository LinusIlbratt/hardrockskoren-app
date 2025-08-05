// src/components/ui/nav/UserNav.tsx

import { NavLink } from "react-router-dom";
import styles from './UserNav.module.scss';
import { useEventNotification } from "@/hooks/useEventNotification";

interface UserNavProps {
  groupName: string | undefined;
}

export const UserNav = ({ groupName }: UserNavProps) => {
  // STEG 1: Hämta den nya funktionen 'resetUpdateNotifications' från hooken.
  const { notificationData, resetUpdateNotifications } = useEventNotification(groupName);

  if (!groupName) {
    return null;
  }

  const getLinkClassName = ({ isActive }: { isActive: boolean }) => 
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  // STEG 3: Skapa en klick-hanterare för att nollställa "uppdaterad"-notiser.
  // Detta är den perfekta platsen: när användaren klickar för att se event-listan,
  // signalerar de att de har "sett" uppdateringarna.
  const handleConcertsLinkClick = () => {
    if (notificationData.updatedEventIds.length > 0) {
      resetUpdateNotifications();
    }
  };

  // STEG 2: Beräkna det totala antalet notiser från de två nya listorna.
  const totalNotifications = notificationData.newEventIds.length + notificationData.updatedEventIds.length;

  return (
    <nav className={styles.nav}>
      <NavLink to="repertoires" className={getLinkClassName}>Material</NavLink>
      <NavLink to="practice" className={getLinkClassName}>Sjung upp</NavLink>
      <NavLink 
        to="concerts" 
        end 
        className={getLinkClassName}
        // Lägg till klick-hanteraren på NavLink
        onClick={handleConcertsLinkClick}
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