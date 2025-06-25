import { Outlet } from 'react-router-dom'; // Importera Outlet
import { useAuth } from '@/context/AuthContext';
import { UserNav } from '@/components/ui/nav/UserNav';
import styles from './MemberDashboard.module.scss';

export const MemberDashboard = () => {
  const { user } = useAuth(); 

  if (!user) {
    return <div>Kunde inte ladda användardata.</div>
  }

  const primaryGroup = user.groups && user.groups.length > 0 ? user.groups[0] : 'Okänd kör';

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1>Välkommen {user.given_name}</h1>
        <p>Dashboard för kören: <strong>{primaryGroup}</strong></p>
      </header>
      
      <UserNav />
      
      <main className={styles.content}>
        {/* Här renderas de olika undersidorna (Repertoar, Events, etc.) */}
        <Outlet />
      </main>
    </div>
  );
};