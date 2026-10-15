import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { GroupCard } from '@/features/groups';
import axios from 'axios';
import styles from './GroupSelectionPage.module.scss';
import type { Group } from '@/types';
import { getApiErrorMessage } from '@/utils/apiError';
import { sortChoirsByName } from '@/utils/sortBySwedishTitle';
import { translateRole } from '@/utils/translations';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

export const GroupSelectionPage = () => {
  const { user, isLoading: isAuthLoading, realRole, viewAsRole, getAuthHeaders } = useAuth();
  const navigate = useNavigate();
  const isAdminPreview = realRole === 'admin' && (viewAsRole === 'leader' || viewAsRole === 'user');

  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserGroups = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    if (isAdminPreview) {
      const headers = getAuthHeaders();
      if (!headers.Authorization) {
        setGroups([]);
        setError('Du måste vara inloggad för att se körerna.');
        setIsLoading(false);
        return;
      }

      try {
        const response = await axios.get<Group[]>(`${API_BASE_URL}/groups`, { headers });
        setGroups(sortChoirsByName(Array.isArray(response.data) ? response.data : []));
        setError(null);
      } catch (err) {
        console.error('Failed to fetch all groups for role preview', err);
        setGroups([]);
        setError(getApiErrorMessage(err, 'Kunde inte hämta körerna.'));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!user.groups || user.groups.length === 0) {
      setIsLoading(false);
      return;
    }

    if (user.groups.length === 1) {
      const groupSlug = user.groups[0];
      const destination = user.role === 'leader'
        ? `/leader/choir/${groupSlug}`
        : `/user/me/${groupSlug}`;
      navigate(destination, { replace: true });
      return;
    }

    try {
      const headers = getAuthHeaders();
      if (headers.Authorization) {
        const response = await axios.post<Group[]>(
          `${API_BASE_URL}/groups/batch-get`,
          { groupSlugs: user.groups },
          { headers }
        );
        setGroups(sortChoirsByName(Array.isArray(response.data) ? response.data : []));
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch group details for user', err);
      setError(getApiErrorMessage(err, 'Kunde inte hämta dina körer.'));
    } finally {
      setIsLoading(false);
    }
  }, [user, navigate, isAdminPreview, getAuthHeaders]);

  useEffect(() => {
    if (!isAuthLoading) {
      fetchUserGroups();
    }
  }, [isAuthLoading, fetchUserGroups]);

  const destinationFor = (slug: string) => {
    if (isAdminPreview) {
      return viewAsRole === 'leader' ? `/leader/choir/${slug}` : `/user/me/${slug}`;
    }
    return user?.role === 'leader' ? `/leader/choir/${slug}` : `/user/me/${slug}`;
  };

  if (isLoading || isAuthLoading) {
    return <div className={styles.page}><p>Laddar dina körer...</p></div>;
  }

  if (error) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Kunde inte hämta körer</h1>
        <p role="alert">{error}</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Inga körer hittades</h1>
        <p>
          {isAdminPreview
            ? 'Det finns inga körer att visa ännu.'
            : 'Du verkar inte vara tillagd i någon kör ännu.'}
        </p>
      </div>
    );
  }

  const previewLabel = viewAsRole === 'leader' || viewAsRole === 'user'
    ? translateRole(viewAsRole)
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {isAdminPreview && previewLabel
            ? `Välj kör att visa som ${previewLabel}`
            : 'Välj en kör'}
        </h1>
        <p>
          {isAdminPreview
            ? 'Välj vilken kör du vill se appen igenom.'
            : 'Du är medlem i flera körer. Välj vilken du vill fortsätta till.'}
        </p>
      </header>

      <div className={isAdminPreview ? `${styles.grid} ${styles.stack}` : styles.grid}>
        {groups.map((group) => (
          <GroupCard
            key={group.id ?? group.slug}
            group={group}
            isLink={true}
            variant={isAdminPreview ? 'selector' : 'poster'}
            destination={destinationFor(group.slug)}
          />
        ))}
      </div>
    </div>
  );
};
