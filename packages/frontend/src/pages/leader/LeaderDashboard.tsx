import { Outlet, useParams } from 'react-router-dom'; // <-- Importera useParams
import { useAuth } from '@/context/AuthContext';
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

  if (!user) {
    return <div>Kunde inte ladda användardata.</div>
  }

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

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        {/* Användarens namn kommer fortfarande från useAuth */}
        <h2>Välkommen {user.given_name} {user.family_name}</h2>
        <p>
          <span className={styles.subheadingLabel}>Körledare i
          {isLoadingName ? ' Laddar...' : ` ${choirDisplayName}`}</span>
        </p>        
      </header>
      
      <LeaderNav />
      
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
};