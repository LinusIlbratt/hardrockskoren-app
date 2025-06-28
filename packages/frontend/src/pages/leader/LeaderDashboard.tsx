import { Outlet, useParams } from 'react-router-dom'; // <-- Importera useParams
import { useAuth } from '@/context/AuthContext';
import { LeaderNav } from '@/components/ui/nav/LeaderNav';
import styles from './LeaderDashboard.module.scss';

export const LeaderDashboard = () => {
  // STEG 1: Hämta groupName från URL-parametern
  const { groupName } = useParams<{ groupName: string }>(); 
  const { user } = useAuth(); 

  if (!user) {
    return <div>Kunde inte ladda användardata.</div>
  }

  // BORTTAGEN: Vi behöver inte längre gissa gruppen från user-objektet
  // const primaryGroup = user.groups && user.groups.length > 0 ? user.groups[0] : 'Okänd kör';

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        {/* Användarens namn kommer fortfarande från useAuth */}
        <h1>{user.given_name} {user.family_name}</h1>        
      </header>
      
      <LeaderNav />
      
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
};