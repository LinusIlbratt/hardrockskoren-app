import { useAuth } from '@/context/AuthContext'; // Importera från rätt ställe
import { Navigate } from 'react-router-dom';
import { MemberDashboard } from '@/pages/member/MemberDashboard';

export const DashboardPage = () => {
  const { user, isLoading } = useAuth();

  // Om vi fortfarande hämtar användardata, visa en laddningssida
  if (isLoading) {
    return <div>Laddar...</div>;
  }

  // Om vi har laddat klart och ingen användare finns, skicka till login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Nu har vi den korrekta användardatan från /me-endpointen
  if (user.role === 'admin') {
    return <Navigate to="/admin/groups" replace />;
  } else {
    return <MemberDashboard user={user} />;
  }
};