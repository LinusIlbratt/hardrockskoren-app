import { useState, useEffect } from 'react';
import { GroupCard } from '@/components/ui/card/GroupCard';
import { IoFilterOutline } from "react-icons/io5";
import { Button } from '@/components/ui/button/Button';
import axios from 'axios';
import styles from './AdminGroupListPage.module.scss'

// Denna typ matchar nu din DynamoDB-struktur
interface Group {
  PK: string; // t.ex. GROUP#Sopran
  SK: string; // t.ex. METADATA
  id: string;
  name: string;
  description: string;
}

// Ersätt med din API-URL
const API_BASE_URL = 'https://tdjzli0x0m.execute-api.eu-north-1.amazonaws.com';

export const AdminGroupListPage = () => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [filteredGroups, setFilteredGroups] = useState<Group[]>([]);
  // State för söksträngen
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    const fetchGroups = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      try {
        const response = await axios.get(`${API_BASE_URL}/groups`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setGroups(response.data);
      } catch (error) {
        console.error("Failed to fetch groups", error);
      }
    };
    fetchGroups();
  }, []);

  const handleDeleteGroup = (groupId: string, groupName: string) => {
    // Använd window.confirm för enkelhetens skull, men en Modal-komponent är bättre.
    if (window.confirm(`Är du säker på att du vill radera gruppen "${groupName}"?`)) {
      console.log("Raderar grupp med ID:", groupId);
      // Här skulle du göra ditt API-anrop till DELETE /groups/{groupName}
    }
  };

  const handleCreateGroup = () => {
    // Logik för att öppna en modal eller navigera till en "skapa grupp"-sida
    console.log("Öppnar skapa grupp-formulär...");
  };

// Effekt som körs varje gång söksträngen ändras
useEffect(() => {
  const filtered = groups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  setFilteredGroups(filtered);
}, [searchQuery, groups]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Körer</h1>
      <div className={styles.topBar}>
        <div className={styles.filterSection}>
          <IoFilterOutline size={20} />
          <input
            type="text"
            placeholder="Filtrera på gruppnamn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button onClick={handleCreateGroup}>
          Skapa Kör
        </Button>
      </div>
      {/* Här applicerar vi nu klassen från vår SCSS-fil */}
      <div className={styles.grid}>
        {filteredGroups.map((group) => (
          <GroupCard 
            key={group.id} 
            group={group} 
            onDelete={handleDeleteGroup} 
          />
        ))}
      </div>
    </div>
  );
};