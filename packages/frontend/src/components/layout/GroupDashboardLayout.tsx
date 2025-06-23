import { useEffect, useState } from 'react';
import { Outlet, useParams, Link } from 'react-router-dom';
import { GroupNav } from '@/components/ui/nav/GroupNav';
import axios from 'axios';
import { IoArrowBack } from 'react-icons/io5'; 
import styles from './GroupDashboardLayout.module.scss';

// Återanvänd Group-typen från din lista-sida
interface Group {
  id: string;
  name: string;
  slug: string;
  description: string;
}

export const GroupDashboardLayout = () => {
  const { groupName: groupSlug } = useParams<{ groupName: string }>(); // Byt namn för tydlighetens skull
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Om ingen slug finns, gör inget
    if (!groupSlug) {
        setIsLoading(false);
        return;
    };

    const fetchGroupDetails = async () => {
      const token = localStorage.getItem('authToken');
      try {
        // Antag att du har en endpoint för att hämta en specifik grupp via dess slug
        const response = await axios.get(`${import.meta.env.VITE_ADMIN_API_URL}/groups/${groupSlug}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setCurrentGroup(response.data);
      } catch (error) {
        console.error("Failed to fetch group details", error);
        // Hantera fel, kanske visa ett felmeddelande
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroupDetails();
  }, [groupSlug]); // Kör denna effekt varje gång sluggen i URL:en ändras

  if (isLoading) {
    return <div>Laddar gruppinformation...</div>;
  }

  if (!currentGroup) {
    return <div>Kunde inte hitta information för gruppen.</div>;
  }

  return (
    <div className={styles.dashboardLayout}>
      <div className={styles.breadcrumb}>
        <Link to="/admin/groups">
          <IoArrowBack />
          Tillbaka till alla körer
        </Link>
      </div>
      <header className={styles.header}>
        {/* Använd nu det hämtade namnet från state */}
        <h1 className={styles.title}>{currentGroup.name}</h1>
        <GroupNav />
      </header>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
};