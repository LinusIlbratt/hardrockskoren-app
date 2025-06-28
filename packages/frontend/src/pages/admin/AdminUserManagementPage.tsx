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
import { UserList } from '@/components/ui/user/userList';
import styles from './AdminUserManagementPage.module.scss';

// Props för komponenten
interface AdminUserManagementPageProps {
  viewerRole: 'admin' | 'leader';
}

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

export const AdminUserManagementPage = ({ viewerRole }: AdminUserManagementPageProps) => {
  const { groupName } = useParams<{ groupName: string }>();

  // --- State-variabler ---
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State för att bjuda in användare
  const [roleToInvite, setRoleToInvite] = useState<RoleTypes | null>(null);

  // State för att redigera en användare i modalen
  const [selectedUser, setSelectedUser] = useState<GroupMember | null>(null);

  // --- Funktioner ---
  const fetchMembers = useCallback(async () => {
    if (!groupName) return;
    setIsLoading(true);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMembers(response.data);
    } catch (error) {
      console.error("Failed to fetch members:", error);
    } finally {
      setIsLoading(false);
    }
  }, [groupName]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);
  
  const handleInviteSuccess = () => {
    setRoleToInvite(null);
    fetchMembers();
  };
  
  // Beräknad variabel för filtrering (körs på varje rendering)
  const filteredMembers = useMemo(() => {
  return members.filter(member =>
    member.given_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.family_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
}, [members, searchTerm]);

  return (
  <div className={styles.pageContainer}>
    {/* Header och sökfält är oförändrade och helt korrekta. */}
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
      // Om vi inte laddar OCH det finns medlemmar, visa UserList-komponenten.
      <UserList
        members={filteredMembers}
        onEditUser={(member) => setSelectedUser(member)}
      />
    ) : (
      // Om vi inte laddar OCH det INTE finns några medlemmar, visa empty state.
      <div className={styles.emptyState}>
        <p>{searchTerm ? 'Inga medlemmar matchade din sökning.' : 'Inga medlemmar har bjudits in till denna kör ännu.'}</p>
      </div>
    )}

    <Modal
      isOpen={!!roleToInvite}
      onClose={() => setRoleToInvite(null)}
      title={`Bjud in ny ${roleToInvite === 'user' ? 'medlem' : 'körledare'}`}
    >
      {roleToInvite && (
        <InviteForm roleToInvite={roleToInvite} onSuccess={handleInviteSuccess} />
      )}
    </Modal>

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