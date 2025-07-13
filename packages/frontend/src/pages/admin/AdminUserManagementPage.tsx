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
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [roleToInvite, setRoleToInvite] = useState<RoleTypes | null>(null);
  const [selectedUser, setSelectedUser] = useState<GroupMember | null>(null);

  // --- Funktioner ---
  const fetchMembers = useCallback(async (tokenForNextPage?: string | null) => {
    if (!groupName) return;

    if (tokenForNextPage) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }

    const token = localStorage.getItem('authToken');
    try {
      const params = new URLSearchParams();
      if (tokenForNextPage) {
        params.append('nextToken', tokenForNextPage);
      }
      params.append('limit', '25');

      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { users, nextToken: newNextToken } = response.data;

      setAllMembers(prev => tokenForNextPage ? [...prev, ...users] : users);
      setNextToken(newNextToken || null);

    } catch (error) {
      console.error("Failed to fetch members:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [groupName]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleInviteSuccess = () => {
    setRoleToInvite(null);
    fetchMembers();
  };

  const filteredMembers = useMemo(() => {
    const terms = searchTerm
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(term => term.length > 0);

    return allMembers.filter(member => {
      const fullName = `${member.given_name} ${member.family_name}`.toLowerCase();
      const email = member.email.toLowerCase();

      return terms.every(term =>
        fullName.includes(term) ||
        email.includes(term)
      );
    });
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
            // ✅ KORRIGERING: Skickar bara med onEditUser-funktionen om användaren är admin.
            onEditUser={viewerRole === 'admin' ? (member) => setSelectedUser(member) : undefined}
          />
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
