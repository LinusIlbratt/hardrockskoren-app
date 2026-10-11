import { Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import styles from './LeaderDashboard.module.scss';

export const LeaderDashboard = () => {
  const { user } = useAuth();

  if (!user) {
    return <div>Kunde inte ladda användardata.</div>;
  }

  return (
    <div className={styles.layout} data-choir-page="">
      <Outlet />
    </div>
  );
};
