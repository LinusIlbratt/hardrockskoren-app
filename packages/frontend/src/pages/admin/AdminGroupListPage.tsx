import { useState, useEffect, useCallback } from 'react';
import { GroupCard } from '@/components/ui/card/GroupCard';
import { IoFilterOutline } from "react-icons/io5";
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { CreateGroupForm } from '@/components/ui/form/CreateGroupForm';
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
  // State för den kompletta listan från API:et
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  // State för den listan som faktiskt visas (kan filtreras)
  const [filteredGroups, setFilteredGroups] = useState<Group[]>([]);
  // State för söksträngen
  const [searchQuery, setSearchQuery] = useState('');
  
  // State för modaler och laddning
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Funktion för att hämta alla grupper från backend
  const fetchGroups = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
      const response = await axios.get(`${API_BASE_URL}/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAllGroups(response.data);
      setFilteredGroups(response.data);
    } catch (error) {
      console.error("Failed to fetch groups", error);
    }
  }, []);

  // Hämta grupper en gång när sidan laddas
  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Filtrera den visade listan varje gång söksträngen eller den fullständiga listan ändras
  useEffect(() => {
    const filtered = allGroups.filter((group) =>
      group.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredGroups(filtered);
  }, [searchQuery, allGroups]);

  // Funktion som körs när den slutgiltiga "Radera"-knappen i modalen klickas
  const handleConfirmDelete = async () => {
    if (!groupToDelete) return;

    setIsDeleting(true);
    const token = localStorage.getItem('authToken');
    if (!token) {
      alert("Autentiseringstoken saknas.");
      setIsDeleting(false);
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/groups/${groupToDelete.name}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setGroupToDelete(null); // Stäng modalen
      fetchGroups(); // Hämta den nya, uppdaterade listan

    } catch (error) {
      console.error(`Failed to delete group ${groupToDelete.name}:`, error);
      alert(`Kunde inte radera gruppen.`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Funktion som körs när en ny grupp har skapats
  const onGroupCreated = () => {
    setIsCreateModalOpen(false);
    fetchGroups(); // Hämta den uppdaterade listan
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Hantera Körer</h1>

      <div className={styles.topBar}>
        <div className={styles.filterSection}>
          <IoFilterOutline size={20} />
          <input
            type="text"
            placeholder="Filtrera på körnamn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          Skapa Kör
        </Button>
      </div>

      <div className={styles.grid}>
        {filteredGroups.map((group) => (
          <GroupCard 
            key={group.id} 
            group={group} 
            // När papperskorgen klickas, spara gruppen som ska raderas
            // Detta triggar modalen att öppnas.
            onDelete={() => setGroupToDelete(group)} 
          />
        ))}
      </div>

      {/* Modal för att SKAPA grupp */}
      <Modal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
        title="Skapa ny kör"
      >
        <CreateGroupForm onSuccess={onGroupCreated} />
      </Modal>

      {/* Modal för att BEKRÄFTA RADERING */}
      <Modal 
        isOpen={!!groupToDelete} 
        onClose={() => setGroupToDelete(null)}
        title="Bekräfta radering"
      >
        <div>
          <p>Är du säker på att du vill radera kören "{groupToDelete?.name}"? Denna åtgärd kan inte ångras.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
          <Button variant={ButtonVariant.Ghost} onClick={() => setGroupToDelete(null)}>
              Avbryt
            </Button>
            <Button variant={ButtonVariant.Destructive} isLoading={isDeleting} onClick={handleConfirmDelete}>
              Ja, radera
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};