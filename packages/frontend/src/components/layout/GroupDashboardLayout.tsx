import { Outlet } from 'react-router-dom';
import styles from './GroupDashboardLayout.module.scss';

import { AppTourProvider } from '@/tours/AppTourProvider';
import { groupDashboardSteps } from '@/tours/admin/groupDashboardSteps';

export const GroupDashboardLayout = () => {
  return (
    <AppTourProvider
      steps={groupDashboardSteps}
      tourKey="group_dashboard_main"
      onClickMask={() => { }}
    >
      <div className={styles.dashboardLayout} data-choir-page="">
        <Outlet />
      </div>
    </AppTourProvider>
  );
};
