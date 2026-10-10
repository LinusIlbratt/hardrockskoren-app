import { Link, Outlet, useParams } from 'react-router-dom';
import { ChoirNav } from '@/components/nav/ChoirNav';
import { GroupNotificationProviders } from '@/context/GroupNotificationProviders';
import { useChoirDisplayName } from '@/features/groups/useChoirDisplayName';
import styles from './GroupDashboardLayout.module.scss';

import { AppTourProvider } from '@/tours/AppTourProvider';
import { groupDashboardSteps } from '@/tours/admin/groupDashboardSteps';

export const GroupDashboardLayout = () => {
  const { groupName: groupSlug } = useParams<{ groupName: string }>();
  const { name: choirName, isLoading } = useChoirDisplayName(groupSlug);

  return (
    <GroupNotificationProviders groupSlug={groupSlug}>
      <AppTourProvider
        steps={groupDashboardSteps}
        tourKey="group_dashboard_main"
        onClickMask={() => { }}
      >
        <div className={styles.dashboardLayout}>
          <header className={styles.header}>
            <div className={styles.topBar}>
              <Link to="/admin/groups" className={styles.backLink}>
                ← Tillbaka till körer
              </Link>
              {(isLoading || choirName) && (
                <h1 className={styles.choirBadge}>
                  {isLoading ? (
                    <span className={styles.nameSkeleton} aria-hidden="true" />
                  ) : (
                    choirName
                  )}
                </h1>
              )}
            </div>
            <ChoirNav groupName={groupSlug} audience="admin" showChoirName={false} embedded />
          </header>
          <main className={styles.content}>
            <Outlet />
          </main>
        </div>
      </AppTourProvider>
    </GroupNotificationProviders>
  );
};
