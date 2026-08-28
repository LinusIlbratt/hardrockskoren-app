import { Outlet, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { GroupNotificationProviders } from '@/context/GroupNotificationProviders';
import { RecentlyPlayedWidget } from '@/components/music/RecentlyPlayedWidget';
import { LeaderNav } from '@/components/ui/nav/LeaderNav';
import styles from './LeaderDashboard.module.scss';
import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

interface Group {
  name: string;
  slug: string;
}

export const LeaderDashboard = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const { user } = useAuth();
  const [choirDisplayName, setChoirDisplayName] = useState('');
  const [isLoadingName, setIsLoadingName] = useState(true);

  useEffect(() => {
    const fetchAndSetChoirName = async () => {
      if (!groupName) return;

      setIsLoadingName(true);
      const token = localStorage.getItem('authToken');

      try {
        const response = await axios.get<Group[]>(`${API_BASE_URL}/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const currentGroup = response.data.find(group => group.slug === groupName);

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
          <h2>Välkommen {user.given_name} {user.family_name}</h2>
          <p>
            <span className={styles.subheadingLabel}>Körledare i
            {isLoadingName ? ' Laddar...' : ` ${choirDisplayName}`}</span>
          </p>
        </header>

        {!isLoadingName && choirDisplayName && groupName && (
          <div className={styles.groupNameRow}>
            <h1 className={styles.groupName}>{choirDisplayName}</h1>
            <RecentlyPlayedWidget groupName={groupName} viewer="leader" />
          </div>
        )}
        <LeaderNav />

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </GroupNotificationProviders>
  );
};
