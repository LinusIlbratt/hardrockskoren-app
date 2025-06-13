import type { AuthContext } from '@hrk/core/types';

// Definiera vilka props komponenten kan ta emot
type AdminDashboardPageProps = {
  user: AuthContext;
};

export const AdminDashboard = ({ user }: AdminDashboardPageProps) => {
    return <div>Välkommen Admin, {user.uuid}! Här är dina admin-verktyg.</div>;
};