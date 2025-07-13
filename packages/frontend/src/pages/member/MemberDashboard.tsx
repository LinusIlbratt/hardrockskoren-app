import { Outlet, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { UserNav } from '@/components/ui/nav/UserNav';
import styles from './MemberDashboard.module.scss';
import { useState, useEffect } from 'react';
import axios from 'axios';

// Ersätt med din API-URL
const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

interface Group {
  name: string;
  slug: string;
}

export const MemberDashboard = () => {
  const { user } = useAuth();
  const { groupName } = useParams<{ groupName: string }>();

  // State för att hålla det korrekta, fullständiga namnet på kören
  const [choirDisplayName, setChoirDisplayName] = useState('');
  const [isLoadingName, setIsLoadingName] = useState(true);

  // Denna effekt körs när komponenten laddas för att hämta det riktiga namnet
  useEffect(() => {
    const fetchAndSetChoirName = async () => {
      if (!groupName) return;

      setIsLoadingName(true);
      const token = localStorage.getItem('authToken');
      
      try {
        // Vi hämtar alla grupper för att hitta namnet som matchar vår slug.
        // Detta är en enkel lösning om du inte har en specifik endpoint för en enskild grupp.
        const response = await axios.get<Group[]>(`${API_BASE_URL}/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        const currentGroup = response.data.find(group => group.slug === groupName);

        if (currentGroup) {
          setChoirDisplayName(currentGroup.name);
        } else {
          // Fallback om gruppen mot förmodan inte hittas
          setChoirDisplayName(groupName);
        }
      } catch (error) {
        console.error("Failed to fetch group name:", error);
        // Fallback vid fel: visa slugen som den är
        setChoirDisplayName(groupName);
      } finally {
        setIsLoadingName(false);
      }
    };

    fetchAndSetChoirName();
  }, [groupName]); // Körs om när groupName i URL:en ändras

  if (!user) {
    return <div>Kunde inte ladda användardata.</div>;
  }

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1>Välkommen {user.given_name}</h1>
        <p>
          <span className={styles.subheadingLabel}>Medlem i
          {isLoadingName ? ' Laddar...' : ` ${choirDisplayName}`}</span>
        </p>
      </header>
      
      <UserNav groupName={groupName} />
      
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
};
