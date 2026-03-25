import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

const SEARCH_DEBOUNCE_MS = 400;

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

export const AdminUserManagementPage = ({ viewerRole }: AdminUserManagementPageProps) => {
  const { groupName } = useParams<{ groupName: string }>();

  const [allMembers, setAllMembers] = useState<GroupMember[]>([]);
  const [searchResults, setSearchResults] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [roleToInvite, setRoleToInvite] = useState<RoleTypes | null>(null);
  const [selectedUser, setSelectedUser] = useState<GroupMember | null>(null);

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollLoadLockRef = useRef(false);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setDebouncedSearch('');
      return;
    }
    const id = window.setTimeout(() => setDebouncedSearch(trimmed), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

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

  const fetchSearchResults = useCallback(async (query: string, signal?: AbortSignal): Promise<GroupMember[]> => {
    if (!groupName) return [];
    const token = localStorage.getItem('authToken');
    const params = new URLSearchParams();
    params.append('q', query);
    const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/users?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    return response.data.users ?? [];
  }, [groupName]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (!groupName) return;

    if (!debouncedSearch) {
      setSearchResults([]);
      setIsSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setIsSearchLoading(true);
    setSearchResults([]);

    fetchSearchResults(debouncedSearch, controller.signal)
      .then((users) => {
        if (active) setSearchResults(users);
      })
      .catch((err) => {
        if (!active || isAbortError(err)) return;
        console.error('Failed to search members:', err);
      })
      .finally(() => {
        if (active) setIsSearchLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedSearch, groupName, fetchSearchResults]);

  const refreshMemberLists = useCallback(async () => {
    if (debouncedSearch) {
      try {
        const users = await fetchSearchResults(debouncedSearch);
        setSearchResults(users);
      } catch (err) {
        console.error('Failed to refresh search results:', err);
      }
    } else {
      await fetchMembers();
    }
  }, [debouncedSearch, fetchMembers, fetchSearchResults]);

  const handleInviteSuccess = () => {
    setRoleToInvite(null);
    void refreshMemberLists();
  };

  const trimmedLiveSearch = searchTerm.trim();
  const isSearchMode = trimmedLiveSearch.length > 0;
  const searchPending =
    isSearchMode && (trimmedLiveSearch !== debouncedSearch || isSearchLoading);
  const membersForDisplay = !isSearchMode ? allMembers : searchPending ? [] : searchResults;

  const sortedMembersForDisplay = useMemo(
    () => sortMembersBySurname(membersForDisplay),
    [membersForDisplay]
  );

  const { leaders, members: membersOnly } = useMemo(() => {
    const leaders = sortedMembersForDisplay.filter(m => m.role === 'leader' || m.role === 'admin');
    const members = sortedMembersForDisplay.filter(m => m.role === 'user');
    return { leaders, members: members };
  }, [sortedMembersForDisplay]);

  const hasAnyFiltered = leaders.length > 0 || membersOnly.length > 0;

  useEffect(() => {
    if (isSearchMode || !nextToken || isLoading) {
      return;
    }

    const el = loadMoreSentinelRef.current;
    if (!el) return;

    const token = nextToken;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit || scrollLoadLockRef.current) return;
        scrollLoadLockRef.current = true;
        void fetchMembers(token).finally(() => {
          scrollLoadLockRef.current = false;
        });
      },
      { root: null, rootMargin: '120px', threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isSearchMode, nextToken, isLoading, fetchMembers]);

  const showMainLoading = isLoading && !isSearchMode;
  const showSearchPendingUi = isSearchMode && searchPending;

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

      {showMainLoading ? (
        <p>Laddar medlemmar...</p>
      ) : showSearchPendingUi ? (
        <p>Söker...</p>
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
          {!isSearchMode && nextToken && (
            <div ref={loadMoreSentinelRef} className={styles.loadMoreSentinel} aria-hidden />
          )}
          {!isSearchMode && isLoadingMore && (
            <p className={styles.loadingMore}>Laddar fler medlemmar...</p>
          )}
        </>
      ) : (
        <div className={styles.emptyState}>
          <p>
            {isSearchMode
              ? 'Inga medlemmar matchade din sökning.'
              : 'Inga medlemmar har bjudits in till denna kör ännu.'}
          </p>
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
          onUserUpdate={() => void refreshMemberLists()}
        />
      )}
    </div>
  );
};
