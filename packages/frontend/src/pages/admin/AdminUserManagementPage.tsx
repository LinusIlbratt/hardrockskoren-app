import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { InviteForm } from '@/components/ui/form/InviteForm';
import { UserEditModal } from '@/components/ui/modal/UserEditModal';
import { StyledSelect, type SelectOption } from '@/components/ui/select/StyledSelect';
import type { RoleTypes } from '@hrk/core/types';
import { Search } from 'lucide-react';
import type { GroupMember } from '@/types';
import { UserList } from '@/components/ui/user/UserList';
import { useAuth } from '@/context/AuthContext';
import styles from './AdminUserManagementPage.module.scss';

interface AdminUserManagementPageProps {
  viewerRole: 'admin' | 'leader';
}

interface ChoirChoice {
  slug: string;
  name: string;
}

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;
const ALL_CHOIRS = '';
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

function sortChoirs(choirs: ChoirChoice[]): ChoirChoice[] {
  return [...choirs].sort((a, b) =>
    a.name.localeCompare(b.name, 'sv', { sensitivity: 'base' }),
  );
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
  const navigate = useNavigate();
  const { user } = useAuth();

  const [choirs, setChoirs] = useState<ChoirChoice[]>([]);
  const [choirsReady, setChoirsReady] = useState(false);
  const [selectedChoir, setSelectedChoir] = useState(groupName ?? ALL_CHOIRS);
  const [allMembers, setAllMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [roleToInvite, setRoleToInvite] = useState<RoleTypes | null>(null);
  const [selectedUser, setSelectedUser] = useState<GroupMember | null>(null);

  useEffect(() => {
    setSelectedChoir(groupName ?? ALL_CHOIRS);
  }, [groupName]);

  useEffect(() => {
    let cancelled = false;

    const loadChoirs = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) return;

      try {
        if (viewerRole === 'admin') {
          const response = await axios.get<Array<{ slug?: string; name?: string }>>(
            `${API_BASE_URL}/groups`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const list = (response.data ?? [])
            .filter((group): group is { slug: string; name?: string } => Boolean(group.slug))
            .map((group) => ({ slug: group.slug, name: group.name || group.slug }));
          if (!cancelled) setChoirs(sortChoirs(list));
          return;
        }

        const slugs = user?.groups?.filter(Boolean) ?? [];
        if (slugs.length === 0) {
          if (!cancelled && groupName) setChoirs([{ slug: groupName, name: groupName }]);
          return;
        }

        const response = await axios.post<Array<{ slug?: string; name?: string }>>(
          `${API_BASE_URL}/groups/batch-get`,
          { groupSlugs: slugs },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const list = (response.data ?? [])
          .filter((group): group is { slug: string; name?: string } => Boolean(group.slug))
          .map((group) => ({ slug: group.slug, name: group.name || group.slug }));
        if (!cancelled) setChoirs(sortChoirs(list.length > 0 ? list : slugs.map((slug) => ({ slug, name: slug }))));
      } catch (error) {
        console.error('Failed to fetch choirs:', error);
        if (!cancelled && groupName) setChoirs([{ slug: groupName, name: groupName }]);
      }
    };

    void loadChoirs().finally(() => {
      if (!cancelled) setChoirsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [viewerRole, user, groupName]);

  useEffect(() => {
    if (!selectedChoir && viewerRole === 'admin' && !choirsReady) {
      setIsLoading(true);
      return;
    }
    if (!selectedChoir && viewerRole !== 'admin') return;

    const controller = new AbortController();
    const token = localStorage.getItem('authToken');
    if (!token) {
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      try {
        if (!selectedChoir) {
          const merged: GroupMember[] = [];
          for (const choir of choirs) {
            const users = await fetchGroupMembers(choir.slug, token, controller.signal);
            for (const member of users) {
              merged.push({ ...member, groupSlug: choir.slug, choirName: choir.name });
            }
          }
          if (!controller.signal.aborted) setAllMembers(merged);
          return;
        }

        const users = await fetchGroupMembers(selectedChoir, token, controller.signal);
        if (!controller.signal.aborted) {
          setAllMembers(users.map((member) => ({ ...member, groupSlug: selectedChoir })));
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
  }, [selectedChoir, choirs, choirsReady, viewerRole, reloadKey]);

  const choirOptions = useMemo<SelectOption[]>(() => {
    const options = choirs.map((choir) => ({ value: choir.slug, label: choir.name }));
    if (viewerRole === 'admin') {
      return [{ value: ALL_CHOIRS, label: 'Alla körer' }, ...options];
    }
    return options;
  }, [choirs, viewerRole]);

  const selectedChoirOption = choirOptions.find((option) => option.value === selectedChoir) ?? null;

  const handleChoirChange = (option: SelectOption | null) => {
    const value = option ? String(option.value) : ALL_CHOIRS;
    if (value === ALL_CHOIRS) {
      setSelectedChoir(ALL_CHOIRS);
      return;
    }
    if (value === groupName) {
      setSelectedChoir(value);
      return;
    }
    const path = viewerRole === 'admin'
      ? `/admin/groups/${value}/users`
      : `/leader/choir/${value}/users`;
    navigate(path);
  };

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
          <Button variant={ButtonVariant.Primary} onClick={() => setRoleToInvite('user')}>Bjud in medlem</Button>
          {viewerRole === 'admin' && (
            <Button variant={ButtonVariant.Primary} onClick={() => setRoleToInvite('leader')}>Bjud in körledare</Button>
          )}
        </div>
      </div>

      <div className={styles.filters}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel} htmlFor="choir-filter">Kör</label>
          <StyledSelect
            inputId="choir-filter"
            options={choirOptions}
            value={selectedChoirOption}
            onChange={handleChoirChange}
            placeholder="Välj kör"
            isDisabled={choirOptions.length === 0}
          />
        </div>

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
        <p>Laddar medlemmar...</p>
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
              : selectedChoir
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
