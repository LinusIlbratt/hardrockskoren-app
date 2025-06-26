import { Outlet } from 'react-router-dom';
import { MainNav } from '../ui/nav/MainNav';
import styles from './AppLayout.module.scss'; // Importera den nya SCSS-modulen

export const AppLayout = () => {
  return (
    <div className={styles.appLayout}>
      <MainNav />
      <main className={styles.mainContent}>
        {/* Outlet renderar den aktiva undersidan */}
        <Outlet />
      </main>
    </div>
  );
};