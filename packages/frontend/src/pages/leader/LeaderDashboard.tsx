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
  const canReturnToChoirList = (user?.groups?.length ?? 0) > 1;

  if (!user) {
    return <div>Kunde inte ladda användardata.</div>;
  }

  return (
    <GroupNotificationProviders groupSlug={groupName}>
      <div className={styles.layout}>
        {canReturnToChoirList && (
          <Link to="/select-group" className={styles.backLink}>
            ← Tillbaka till körer
          </Link>
        )}
        <header className={styles.header}>
          <h2>Välkommen {user.given_name} {user.family_name}</h2>
          <p>
            <span className={styles.subheadingLabel}>
              Körledare i {isLoadingName ? "…" : (choirName ?? "")}
            </span>
          </p>
        </header>

        <div className={styles.groupNameRow}>
          <h1 className={styles.groupName}>
            {isLoadingName ? (
              <span className={styles.nameSkeleton} aria-hidden="true" />
            ) : (
              choirName ?? ""
            )}
          </h1>
        </div>
        <ChoirNav groupName={groupName} audience="leader" showChoirName={false} embedded />

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </GroupNotificationProviders>
  );
};
