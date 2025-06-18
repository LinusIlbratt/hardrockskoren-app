import { Outlet, useParams, Link } from 'react-router-dom';
import { GroupNav } from '@/components/ui/nav/GroupNav';
import { IoArrowBack } from 'react-icons/io5'; 
import styles from './GroupDashboardLayout.module.scss';

export const GroupDashboardLayout = () => {
  // Hämta gruppens namn från URL:en
  const { groupName } = useParams<{ groupName: string }>();

  // Om inget gruppnamn finns, visa ett fel eller ladda...
  if (!groupName) {
    return <div>Gruppnamn saknas i URL.</div>;
  }

  return (
    <div className={styles.dashboardLayout}>
        {/* NY "TILLBAKA"-LÄNK */}
      <div className={styles.breadcrumb}>
        <Link to="/admin/groups">
          <IoArrowBack />
          Tillbaka till alla körer
        </Link>
      </div>
      <header className={styles.header}>
        <h1 className={styles.title}>Grupp: {groupName}</h1>
        {/* Här renderar vi vår delade navigeringsmeny */}
        {/* KORRIGERING: Anropet behöver inte längre groupName som en prop */}
        <GroupNav />
      </header>
      <main className={styles.content}>
        {/* Här kommer undersidorna (Innehåll, Användare, etc.) att renderas */}
        <Outlet />
      </main>
    </div>
  );
};