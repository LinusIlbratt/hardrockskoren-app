import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { InviteForm, UserEditModal, UserList } from '@/features/users';
import type { GroupMember, RoleTypes } from '@/types';
import { Search } from 'lucide-react';
import styles from './AdminUserManagementPage.module.scss';

interface AdminUserManagementPageProps {
  viewerRole: Exclude<RoleTypes, 'user'>;
}

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;
const MAX_MEMBER_PAGES = 50;

function isAbortError(err: unknown): boolean {
  return axios.isAxiosError(err) && (err.code === 'ERR_CANCELED' || err.name === 'CanceledError');
}

function sortMembersBySurname(members: GroupMember[]): GroupMember[] {
  return [...members].sort((a, b) => {
    const lnA = (a.family_name ?? '').toLocaleLowerCase('sv');
    const lnB = (b.family_name ?? '').toLocaleLowerCase('sv');
    const byLast = lnA.localeCompare(lnB, 'sv', { sensitivity: 'base' });
    if (byLast !== 0) return byLast;
    const fnA = (a.given_name ?? '').toLocaleLowerCase('sv');
    const fnB = (b.given_name ?? '').toLocaleLowerCase('sv');
    const byFirst = fnA.localeCompare(fnB, 'sv', { sensitivity: 'base' });
    if (byFirst !== 0) return byFirst;
    return (a.email ?? '').localeCompare(b.email ?? '', 'sv', { sensitivity: 'base' });
  });
}

function memberMatchesQuery(member: GroupMember, rawQuery: string): boolean {
  const terms = rawQuery.trim().toLocaleLowerCase('sv').split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [member.given_name, member.family_name, member.email]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .toLocaleLowerCase('sv');
  return terms.every((term) => haystack.includes(term));
}

async function fetchGroupMembers(
  groupSlug: string,
  token: string,
  signal: AbortSignal,
): Promise<GroupMember[]> {
  const collected: GroupMember[] = [];
  let pageToken: string | null = null;
  let pages = 0;

  do {
    const params = new URLSearchParams();
    params.set('limit', '60');
    if (pageToken) params.set('nextToken', pageToken);
    const response = await axios.get(
      `${API_BASE_URL}/groups/${groupSlug}/users?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    );
    const users: GroupMember[] = response.data.users ?? [];
    collected.push(...users);
    pageToken = response.data.nextToken || null;
    pages += 1;
  } while (pageToken && pages < MAX_MEMBER_PAGES);

  return collected;
}

export const AdminUserManagementPage = ({ viewerRole }: AdminUserManagementPageProps) => {
  const { groupName } = useParams<{ groupName: string }>();

  const [allMembers, setAllMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [roleToInvite, setRoleToInvite] = useState<RoleTypes | null>(null);
  const [selectedUser, setSelectedUser] = useState<GroupMember | null>(null);

  useEffect(() => {
    if (!groupName) {
      setAllMembers([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const token = localStorage.getItem('authToken');
    if (!token) {
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      try {
        const users = await fetchGroupMembers(groupName, token, controller.signal);
        if (!controller.signal.aborted) {
          setAllMembers(users.map((member) => ({ ...member, groupSlug: groupName })));
        }
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) return;
        console.error('Failed to fetch members:', error);
        setAllMembers([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [groupName, reloadKey]);

  const refreshMemberLists = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const handleInviteSuccess = () => {
    setRoleToInvite(null);
    refreshMemberLists();
  };

  const trimmedSearch = searchTerm.trim();
  const isSearchMode = trimmedSearch.length > 0;

  const sortedMembersForDisplay = useMemo(() => {
    const matched = isSearchMode
      ? allMembers.filter((member) => memberMatchesQuery(member, trimmedSearch))
      : allMembers;
    return sortMembersBySurname(matched);
  }, [allMembers, isSearchMode, trimmedSearch]);

  const { leaders, members: membersOnly } = useMemo(() => {
    const leaders = sortedMembersForDisplay.filter(m => m.role === 'leader' || m.role === 'admin');
    const members = sortedMembersForDisplay.filter(m => m.role === 'user');
    return { leaders, members };
  }, [sortedMembersForDisplay]);

  const hasAnyFiltered = leaders.length > 0 || membersOnly.length > 0;
  const editGroupSlug = selectedUser?.groupSlug || groupName;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Hantera medlemmar</h2>
        <div className={styles.buttonGroup}>
          <Button className={styles.primaryButton} variant={ButtonVariant.Primary} onClick={() => setRoleToInvite('user')}>Bjud in medlem</Button>
          {viewerRole === 'admin' && (
            <Button className={styles.secondaryButton} variant={ButtonVariant.Primary} onClick={() => setRoleToInvite('leader')}>Bjud in körledare</Button>
          )}
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.searchBar}>
          <Search className={styles.searchIcon} size={20} />
          <input
            id="member-search"
            type="text"
            placeholder="Sök medlem (namn eller e-post)..."
            aria-label="Sök medlem (namn eller e-post)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <p className={styles.statusText}>Laddar medlemmar...</p>
      ) : hasAnyFiltered ? (
        <>
          {leaders.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Körledare</h3>
              <UserList
                members={leaders}
                onEditUser={viewerRole === 'admin' ? (member) => setSelectedUser(member) : undefined}
              />
            </section>
          )}
          {membersOnly.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Medlemmar</h3>
              <UserList
                members={membersOnly}
                onEditUser={viewerRole === 'admin' ? (member) => setSelectedUser(member) : undefined}
              />
            </section>
          )}
        </>
      ) : (
        <div className={styles.emptyState}>
          <p>
            {isSearchMode
              ? 'Inga medlemmar matchade din sökning.'
              : groupName
                ? 'Inga medlemmar har bjudits in till denna kör ännu.'
                : 'Inga medlemmar att visa.'}
          </p>
        </div>
      )}

      <Modal
        formMode
        isOpen={!!roleToInvite}
        onClose={() => setRoleToInvite(null)}
        title={`Bjud in ny ${roleToInvite === 'user' ? 'medlem' : 'körledare'}`}
      >
        {roleToInvite && (
          <InviteForm roleToInvite={roleToInvite} onSuccess={handleInviteSuccess} />
        )}
      </Modal>

      {selectedUser && editGroupSlug && (
        <UserEditModal
          user={selectedUser}
          groupSlug={editGroupSlug}
          onClose={() => setSelectedUser(null)}
          onUserUpdate={refreshMemberLists}
        />
      )}
    </div>
  );
};
