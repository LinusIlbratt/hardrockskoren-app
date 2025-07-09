import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { MainNav } from '../ui/nav/MainNav';
import styles from './AppLayout.module.scss';

export const AppLayout = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isLoading } = useAuth();

  if (isLoading) {
    return <div>Laddar applikationens layout...</div>;
  }

  return (
    <div className={styles.appLayout}>
      <MainNav isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
      <main className={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  );
};
