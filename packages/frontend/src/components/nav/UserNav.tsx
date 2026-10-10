import { NavLink } from "react-router-dom";
import styles from "./UserNav.module.scss";
import { useEventNotification } from "@/hooks/useEventNotification";
import { useMessageUnread } from "@/hooks/useMessageUnread";
import { useChoirDisplayName } from "@/features/groups/useChoirDisplayName";

interface UserNavProps {
  /** URL-slug. Används bara som nyckel mot körposten, aldrig som visningsnamn. */
  groupName: string | undefined;
}

export const UserNav = ({ groupName }: UserNavProps) => {
  const { notificationData } = useEventNotification();
  const { unreadStatus } = useMessageUnread();
  const { name: choirName, isLoading: isChoirNameLoading } = useChoirDisplayName(groupName);

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
    <nav className={styles.nav} aria-label="Medlemssektioner">
      <div className={styles.groupLabel} aria-busy={isChoirNameLoading}>
        {isChoirNameLoading ? (
          <span className={styles.groupLabelSkeleton} aria-hidden="true" />
        ) : (
          choirName ?? ""
        )}
      </div>
      <div className={styles.list}>
        <NavLink to={`${base}/repertoires`} className={getLinkClassName}>
          Repertoar
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
          Gig & Rep
          {notificationData.hasNotification && totalNotifications > 0 && (
            <span className={styles.badge}>{totalNotifications}</span>
          )}
        </NavLink>
      </div>
    </nav>
  );
};
