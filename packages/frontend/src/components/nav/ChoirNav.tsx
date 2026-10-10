import { NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useEventNotification } from "@/hooks/useEventNotification";
import { useMessageUnread } from "@/hooks/useMessageUnread";
import { useChoirDisplayName } from "@/features/groups/useChoirDisplayName";
import type { RoleTypes } from "@/types";
import styles from "./UserNav.module.scss";

export type ChoirAudience = "member" | "leader" | "admin";

interface ChoirTab {
  segment: string;
  label: string;
  audiences: readonly ChoirAudience[];
  /** Tom lista = alla roller som redan får se vyn. Annars måste rollen finnas med. */
  roles?: readonly RoleTypes[];
  /** Aktiv bara på exakt den här sökvägen. Repertoar lämnas öppen så låtvyer håller fliken tänd. */
  end?: boolean;
  tourId?: string;
}

const CHOIR_TABS: readonly ChoirTab[] = [
  { segment: "repertoires", label: "Repertoar", audiences: ["member", "leader", "admin"], tourId: "group-nav-repertoires" },
  { segment: "practice", label: "Sjung upp", audiences: ["member", "leader", "admin"], tourId: "group-nav-practice" },
  { segment: "aktuellt", label: "Aktuellt", audiences: ["member", "leader", "admin"], tourId: "group-nav-aktuellt" },
  { segment: "concerts", label: "Gig & Rep", audiences: ["member", "leader", "admin"], end: true, tourId: "group-nav-concerts" },
  { segment: "users", label: "Användare", audiences: ["admin", "leader"], roles: ["admin"], tourId: "group-nav-users" },
  { segment: "attendance", label: "Närvaro", audiences: ["admin", "leader"], tourId: "group-nav-attendance" },
];

const BASE_PATH: Record<ChoirAudience, (groupName: string) => string> = {
  member: (groupName) => `/user/me/${groupName}`,
  admin: (groupName) => `/admin/groups/${groupName}`,
  leader: (groupName) => `/leader/choir/${groupName}`,
};

interface ChoirNavProps {
  /** URL-slug. Används bara som nyckel, aldrig som visningsnamn. */
  groupName: string | undefined;
  audience: ChoirAudience;
  /** Medlemsvyn visar körnamnet här. Admin och ledare har namnet i sidhuvudet. */
  showChoirName?: boolean;
  /** Inuti en redan begränsad innehållskolumn, så flikarna inte får en extra sidindragning. */
  embedded?: boolean;
}

export function ChoirNav({
  groupName,
  audience,
  showChoirName = true,
  embedded = false,
}: ChoirNavProps) {
  const { user } = useAuth();
  const { notificationData } = useEventNotification();
  const { unreadStatus } = useMessageUnread();
  const { name: choirName, isLoading: isChoirNameLoading } = useChoirDisplayName(
    showChoirName ? groupName : undefined,
  );

  if (!groupName) {
    return null;
  }

  const role = user?.role;
  const tabs = CHOIR_TABS.filter((tab) => {
    if (!tab.audiences.includes(audience)) return false;
    if (tab.roles && (!role || !tab.roles.includes(role))) return false;
    return true;
  });

  const base = BASE_PATH[audience](groupName);
  const totalNotifications =
    notificationData.newEventIds.length +
    Object.keys(notificationData.updatedEvents).length;

  const getLinkClassName = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.navLink} ${styles.active}` : styles.navLink;

  return (
    <nav
      className={embedded ? `${styles.nav} ${styles.embedded}` : styles.nav}
      aria-label="Körsektioner"
      data-tour={audience === "admin" ? "group-nav" : undefined}
    >
      <div className={styles.frame}>
        {showChoirName && (
          <div className={styles.groupLabel} aria-busy={isChoirNameLoading}>
            {isChoirNameLoading ? (
              <span className={styles.groupLabelSkeleton} aria-hidden="true" />
            ) : (
              choirName ?? ""
            )}
          </div>
        )}
        <div className={styles.list}>
          {tabs.map((tab) => (
            <NavLink
              key={tab.segment}
              to={`${base}/${tab.segment}`}
              end={tab.end}
              className={getLinkClassName}
              data-tour={audience === "admin" ? tab.tourId : undefined}
            >
              {tab.label}
              {tab.segment === "aktuellt" && unreadStatus.hasUnread && (
                <span className={styles.unreadDot} aria-label="Olästa meddelanden" />
              )}
              {tab.segment === "concerts" && notificationData.hasNotification && totalNotifications > 0 && (
                <span className={styles.badge}>{totalNotifications}</span>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
