import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { InviteForm } from '@/components/ui/form/InviteForm';
import { UserEditModal } from '@/components/ui/modal/UserEditModal';
import type { RoleTypes } from '@hrk/core/types';
import { Search } from 'lucide-react';
import type { GroupMember } from '@/types';
import { UserList } from '@/components/ui/user/UserList';
import styles from './AdminUserManagementPage.module.scss';

interface AdminUserManagementPageProps {
  viewerRole: 'admin' | 'leader';
}

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

export const AdminUserManagementPage = ({ viewerRole }: AdminUserManagementPageProps) => {
  const { groupName } = useParams<{ groupName: string }>();

  // --- State-variabler ---
  const [allMembers, setAllMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // NYTT: State för paginering
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [roleToInvite, setRoleToInvite] = useState<RoleTypes | null>(null);
  const [selectedUser, setSelectedUser] = useState<GroupMember | null>(null);

  // --- Funktioner ---
  const fetchMembers = useCallback(async (tokenForNextPage?: string | null) => {
    if (!groupName) return;

    // Sätt rätt laddnings-state
    if (tokenForNextPage) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    const token = localStorage.getItem('authToken');
    try {
      // Bygg URL med paginerings-parametrar
      const params = new URLSearchParams();
      if (tokenForNextPage) {
        params.append('nextToken', tokenForNextPage);
      }
      params.append('limit', '25'); // Hämta 25 i taget

      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { users, nextToken: newNextToken } = response.data;

      // Om vi hämtar en ny sida, lägg till användarna. Annars, ersätt.
      setAllMembers(prev => tokenForNextPage ? [...prev, ...users] : users);
      setNextToken(newNextToken || null);

    } catch (error) {
      console.error("Failed to fetch members:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [groupName]);

  // Hämta den första sidan när komponenten laddas
  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);
  
  const handleInviteSuccess = () => {
    setRoleToInvite(null);
    fetchMembers(); // Ladda om hela listan från början
  };
  
  const filteredMembers = useMemo(() => {
    return allMembers.filter(member =>
      member.given_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.family_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allMembers, searchTerm]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Hantera medlemmar</h2>
        <div className={styles.buttonGroup}>
          <Button variant={ButtonVariant.Primary} onClick={() => setRoleToInvite('user')}>Bjud in medlem</Button>
          {viewerRole === 'admin' && (
            <Button variant={ButtonVariant.Primary} onClick={() => setRoleToInvite('leader')}>Bjud in körledare</Button>
          )}
        </div>
      </div>

      <div className={styles.searchBar}>
        <Search className={styles.searchIcon} size={20} />
        <input
          type="text"
          placeholder="Sök på namn eller e-post..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p>Laddar medlemmar...</p>
      ) : filteredMembers.length > 0 ? (
        <>
          <UserList
            members={filteredMembers}
            onEditUser={(member) => setSelectedUser(member)}
          />
          {/* NYTT: "Ladda fler"-knapp */}
          {nextToken && !searchTerm && (
            <div className={styles.loadMoreContainer}>
              <Button
                onClick={() => fetchMembers(nextToken)}
                isLoading={isLoadingMore}
                variant={ButtonVariant.Primary}
              >
                Ladda fler
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className={styles.emptyState}>
          <p>{searchTerm ? 'Inga medlemmar matchade din sökning.' : 'Inga medlemmar har bjudits in till denna kör ännu.'}</p>
        </div>
      )}

      {/* KORRIGERING: Lade tillbaka InviteForm i modalen */}
      <Modal
        isOpen={!!roleToInvite}
        onClose={() => setRoleToInvite(null)}
        title={`Bjud in ny ${roleToInvite === 'user' ? 'medlem' : 'körledare'}`}
      >
        {roleToInvite && (
          <InviteForm roleToInvite={roleToInvite} onSuccess={handleInviteSuccess} />
        )}
      </Modal>

      {/* KORRIGERING: Lade tillbaka UserEditModal */}
      {selectedUser && groupName && (
        <UserEditModal
          user={selectedUser}
          groupSlug={groupName}
          onClose={() => setSelectedUser(null)}
          onUserUpdate={fetchMembers}
        />
      )}
    </div>
  );
};
