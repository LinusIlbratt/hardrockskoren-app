import { Outlet, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { GroupNotificationProviders } from "@/context/GroupNotificationProviders";
import { UserNav } from "@/components/ui/nav/UserNav";
import { RecentlyPlayedWidget } from "@/components/music/RecentlyPlayedWidget";
import styles from "./MemberDashboard.module.scss";
import { useState, useEffect } from "react";
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

interface Group {
  name: string;
  slug: string;
}

export const MemberDashboard = () => {
  const { user } = useAuth();
  const { groupName } = useParams<{ groupName: string }>();

  const [choirDisplayName, setChoirDisplayName] = useState("");
  const [isLoadingName, setIsLoadingName] = useState(true);

  useEffect(() => {
    const fetchAndSetChoirName = async () => {
      if (!groupName) return;

      setIsLoadingName(true);
      const token = localStorage.getItem("authToken");

      try {
        const response = await axios.get<Group[]>(`${API_BASE_URL}/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const currentGroup = response.data.find(
          (group) => group.slug === groupName,
        );

        if (currentGroup) {
          setChoirDisplayName(currentGroup.name);
        } else {
          setChoirDisplayName(groupName);
        }
      } catch (error) {
        console.error("Failed to fetch group name:", error);
        setChoirDisplayName(groupName);
      } finally {
        setIsLoadingName(false);
      }
    };

    fetchAndSetChoirName();
  }, [groupName]);

  if (!user) {
    return <div>Kunde inte ladda användardata.</div>;
  }

  return (
    <GroupNotificationProviders groupSlug={groupName}>
      <div className={styles.layout}>
        <header className={styles.header}>
          <h1>Välkommen {user.given_name}</h1>
          <p>
            <span className={styles.subheadingLabel}>
              Medlem i{isLoadingName ? " Laddar..." : ` ${choirDisplayName}`}
            </span>
          </p>
        </header>

        {!isLoadingName && choirDisplayName && groupName && (
          <div className={styles.groupNameRow}>
            <h2 className={styles.groupName}>{choirDisplayName}</h2>
            <RecentlyPlayedWidget groupName={groupName} viewer="member" />
          </div>
        )}
        <UserNav groupName={groupName} />

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </GroupNotificationProviders>
  );
};
