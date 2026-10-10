import { useState, useEffect, useCallback } from 'react';
import { CreateGroupForm, GroupCard } from '@/features/groups';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';

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
  const [hasLoaded, setHasLoaded] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const isMobile = useIsMobile();

  // Funktion för att hämta alla körer från backend
  const fetchGroups = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setHasLoaded(true);
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAllGroups(response.data);
      setFilteredGroups(response.data);
    } catch (error) {
      console.error("Failed to fetch groups", error);
    } finally {
      setHasLoaded(true);
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
            <input
              type="search"
              placeholder="Sök kör..."
              aria-label="Sök kör"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-tour="admin-filter-input"
            />
          </div>
          <Button
            variant={ButtonVariant.Ghost}
            className={styles.createButton}
            onClick={() => setIsCreateModalOpen(true)}
            data-tour="admin-create-group-button"
          >
            Skapa Kör
          </Button>
        </div>

        {hasLoaded && filteredGroups.length === 0 ? (
          <p className={styles.empty}>
            {searchQuery.trim() ? 'Inga körer matchar sökningen.' : 'Inga körer ännu.'}
          </p>
        ) : (
          <div className={styles.list}>
            {filteredGroups.map((group, index) => (
              <GroupCard
                key={group.id}
                group={group}
                variant="selector"
                destination={`/admin/groups/${group.slug}`}
                data-tour={index === 0 ? 'group-card' : undefined}
              />
            ))}
          </div>
        )}

        {/* Modal för att SKAPA kör */}
        <Modal
          formMode
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="Skapa ny kör"
        >
          <CreateGroupForm onSuccess={onGroupCreated} />
        </Modal>

      </div>
    </AppTourProvider>
  );

};