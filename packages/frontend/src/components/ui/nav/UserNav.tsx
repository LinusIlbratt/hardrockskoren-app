// src/components/ui/nav/UserNav.tsx

import { NavLink } from "react-router-dom";
import styles from "./UserNav.module.scss";
import { useEventNotification } from "@/hooks/useEventNotification";
import { useMessageUnread } from "@/hooks/useMessageUnread";

interface UserNavProps {
  groupName: string | undefined;
}

export const UserNav = ({ groupName }: UserNavProps) => {
  const { notificationData } = useEventNotification(groupName);
  const { unreadStatus } = useMessageUnread(groupName);

  if (!groupName) {
    return null;
  }

  const getLinkClassName = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  const totalNotifications =
    notificationData.newEventIds.length +
    Object.keys(notificationData.updatedEvents).length;

  const base = `/user/me/${groupName}`;

  return (
    <nav className={styles.nav}>
      <NavLink to={`${base}/repertoires`} className={getLinkClassName}>
        Repetoar
      </NavLink>
      <NavLink to={`${base}/practice`} className={getLinkClassName}>
        Sjung upp
      </NavLink>
      <NavLink to={`${base}/aktuellt`} className={getLinkClassName}>
        Aktuellt
        {unreadStatus.hasUnread && (
          <span className={styles.unreadDot} aria-label="Olästa meddelanden" />
        )}
      </NavLink>
      <NavLink
        to={`${base}/concerts`}
        end
        className={getLinkClassName}
      >
        Konsert & Repdatum
        {notificationData.hasNotification && totalNotifications > 0 && (
          <span className={styles.badge}>{totalNotifications}</span>
        )}
      </NavLink>
    </nav>
  );
};
