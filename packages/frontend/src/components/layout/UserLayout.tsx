import { Outlet } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';

export const UserLayout = () => {
  return (
    // Vi återanvänder vår globala Layout-komponent för att
    // ge alla admin-sidor en konsekvent bredd och centrering.
    <Layout>
      {/* Outlet renderar den aktiva undersidan (t.ex. GroupList eller GroupDashboard) */}
      <Outlet />
    </Layout>
  );
};