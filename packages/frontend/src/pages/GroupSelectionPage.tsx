import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { GroupCard } from '@/components/ui/card/GroupCard';
import axios from 'axios';
import styles from './GroupSelectionPage.module.scss';

// Definierar Group-typen direkt i filen
interface Group {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl?: string;
}

export const GroupSelectionPage = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserGroups = useCallback(async () => {
    if (!user || !user.groups || user.groups.length === 0) {
      setIsLoading(false);
      return;
    }

    if (user.groups.length === 1) {
      const groupSlug = user.groups[0];
      // ÄNDRING HÄR OCKSÅ: Se till att omdirigeringen är korrekt
      const destination = user.role === 'leader' 
        ? `/leader/choir/${groupSlug}` 
        : `/user/me/${groupSlug}`;
      navigate(destination, { replace: true });
      return;
    }
    
    try {
      const token = localStorage.getItem('authToken');
      if (token) {
        const response = await axios.post(
          `${import.meta.env.VITE_ADMIN_API_URL}/groups/batch-get`, 
          { groupSlugs: user.groups },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setGroups(response.data);
      }
    } catch (error) {
      console.error("Failed to fetch group details for user", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!isAuthLoading) {
      fetchUserGroups();
    }
  }, [isAuthLoading, fetchUserGroups]);

  if (isLoading || isAuthLoading) {
    return <div className={styles.page}><p>Laddar dina körer...</p></div>;
  }

  if (groups.length === 0) {
    return (
      <div className={styles.page}>
        <h1>Inga körer hittades</h1>
        <p>Du verkar inte vara tillagd i någon kör ännu.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Välj en kör</h1>
        <p>Du är medlem i flera körer. Välj vilken du vill fortsätta till.</p>
      </header>

      <div className={styles.grid}>
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            isLink={true}
            // ÄNDRING: Byt ut 'groups' mot 'choir' för att matcha routern
            destination={user?.role === 'leader' ? `/leader/choir/${group.slug}` : `/user/me/${group.slug}`}
          />
        ))}
      </div>
    </div>
  );
};
