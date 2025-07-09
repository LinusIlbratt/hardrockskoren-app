// Fil: GroupDashboardLayout.tsx

import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { GroupNav } from '@/components/ui/nav/GroupNav';
import axios from 'axios';
import styles from './GroupDashboardLayout.module.scss';

// ÄNDRING: Importera det vi behöver för guiden
import { AppTourProvider } from '@/tours/AppTourProvider';
import { groupDashboardSteps } from '@/tours/admin/groupDashboardSteps';

interface Group {
  id: string;
  name: string;
  slug: string;
  description: string;
}

export const GroupDashboardLayout = () => {
  const { groupName: groupSlug } = useParams<{ groupName: string }>();
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    if (!groupSlug) {
      setIsLoading(false);
      return;
    };

    const fetchGroupDetails = async () => {
      const token = localStorage.getItem('authToken');
      try {
        const response = await axios.get(`${import.meta.env.VITE_ADMIN_API_URL}/groups/${groupSlug}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCurrentGroup(response.data);
      } catch (error) {
        console.error("Failed to fetch group details", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroupDetails();
  }, [groupSlug]);

  if (isLoading) {
    return <div>Laddar körinformation...</div>;
  }

  if (!currentGroup) {
    return <div>Kunde inte hitta information för kören.</div>;
  }

  return (
    // ÄNDRING: Här wrappar vi allt i AppTourProvider
    <AppTourProvider
      steps={groupDashboardSteps}
      // Vi skapar en unik nyckel för varje kör guide!
      tourKey={`group_dashboard_${currentGroup.slug}`}
      onClickMask={() => {}}
    >
      <div className={styles.dashboardLayout}>
        <header className={styles.header}>
          <GroupNav />
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </AppTourProvider>
  );
};