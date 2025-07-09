import { useState, useEffect, useCallback } from 'react';
import { GroupCard } from '@/components/ui/card/GroupCard';
import { IoFilterOutline } from "react-icons/io5";
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { CreateGroupForm } from '@/components/ui/form/CreateGroupForm';

import { adminListGroupPageStepsMobile } from '@/tours/admin/adminListGroupPageStepsMobile';
import { adminListGroupPageStepsDesktop } from '@/tours/admin/adminListGroupPageStepsDesktop';
import { AppTourProvider } from '@/tours/AppTourProvider';
import { useIsMobile } from '@/hooks/useIsMobile';

import axios from 'axios';
import styles from './AdminGroupListPage.module.scss'

// Denna typ matchar nu din DynamoDB-struktur
interface Group {
  PK: string; // t.ex. GROUP#Sopran
  SK: string; // t.ex. METADATA
  id: string;
  name: string;
  slug: string;
  description: string;
}

// Ersätt med din API-URL
const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

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
  const isMobile = useIsMobile();

  // Funktion för att hämta alla körer från backend
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

  // Hämta körer en gång när sidan laddas
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
      await axios.delete(`${API_BASE_URL}/groups/${groupToDelete.slug}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setGroupToDelete(null); // Stäng modalen
      fetchGroups(); // Hämta den nya, uppdaterade listan

    } catch (error) {
      console.error(`Failed to delete group ${groupToDelete.slug}:`, error);
      alert(`Kunde inte radera kören.`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Funktion som körs när en ny kör har skapats
  const onGroupCreated = () => {
    setIsCreateModalOpen(false);
    fetchGroups(); // Hämta den uppdaterade listan
  };

  // useCloseTourOnUserInteraction(); // Kommenterad bort

  return (
    <AppTourProvider
      steps={isMobile ? adminListGroupPageStepsMobile : adminListGroupPageStepsDesktop}
      tourKey={isMobile ? "admin_groups_mobile" : "admin_groups_desktop"}
      // ÄNDRING 1: Inaktivera klick på bakgrunden
      onClickMask={() => {}}
    >
      <div className={styles.page}>
        <h1 className={styles.title}>Hantera Körer</h1>

        <div className={styles.topBar}>
          <div className={styles.filterSection}>
            <IoFilterOutline size={20} />
            {/* ÄNDRING 2: Återställd onChange */}
            <input
              type="text"
              placeholder="Filtrera på körnamn..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-tour="admin-filter-input"
            />
          </div>
          {/* ÄNDRING 3: Återställd onClick */}
          <Button 
            onClick={() => setIsCreateModalOpen(true)} 
            data-tour="admin-create-group-button"
          >
            Skapa Kör
          </Button>
        </div>

        <div className={styles.grid}>
          {filteredGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onDelete={() => setGroupToDelete(group)}
            />
          ))}
        </div>

        {/* Modal för att SKAPA kör */}
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
              <Button variant={ButtonVariant.Primary} isLoading={isDeleting} onClick={handleConfirmDelete}>
                Ja, radera
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppTourProvider>
  );

};