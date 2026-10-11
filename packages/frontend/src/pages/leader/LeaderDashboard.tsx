import { Link, Outlet, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { GroupNotificationProviders } from '@/context/GroupNotificationProviders';
import { ChoirNav } from '@/components/nav/ChoirNav';
import { useChoirDisplayName } from '@/features/groups/useChoirDisplayName';
import styles from './LeaderDashboard.module.scss';

export const LeaderDashboard = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const { user } = useAuth();
  const { name: choirName, isLoading: isLoadingName } = useChoirDisplayName(groupName);

  if (!user) {
    return <div>Kunde inte ladda användardata.</div>;
  }

  const hasSeveralChoirs = (user.groups?.length ?? 0) > 1;

  return (
    <GroupNotificationProviders groupSlug={groupName}>
      <div className={styles.layout}>
        <div className={styles.topBar}>
          {hasSeveralChoirs ? (
            <Link to="/select-group" className={styles.backLink}>
              ← Tillbaka till körer
            </Link>
          ) : (
            <span className={styles.leaderName}>
              {user.given_name} {user.family_name}
            </span>
          )}

          <div className={styles.choirBadge}>
            {isLoadingName ? (
              <span className={styles.nameSkeleton} aria-hidden="true" />
            ) : (
              choirName ?? ""
            )}
          </div>
        </div>

        <ChoirNav groupName={groupName} audience="leader" showChoirName={false} embedded />

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </GroupNotificationProviders>
  );
};
