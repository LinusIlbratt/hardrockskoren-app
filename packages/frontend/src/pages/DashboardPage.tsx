import { useAuth } from '@/context/AuthContext';
import { Navigate } from 'react-router-dom';

export const DashboardPage = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Laddar...</div>;
  }

  // Om ingen användare finns, skicka till login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Om användaren är admin, skicka till admin-sidorna
  if (user.role === 'admin') {
    return <Navigate to="/admin/groups" replace />;
  } 

  if (user.role === 'leader') {
  const leaderGroupSlug = user.groups?.[0]; 

  if (leaderGroupSlug) {
    // Skicka dem direkt till den specifika körens dashboard-sida
    return <Navigate to={`/leader/choir/${leaderGroupSlug}/repertoires`} replace />;
  }
  
  // Fallback om de av någon anledning inte har en grupp
  // Skicka dem till en tom leader-sida eller en fel-sida.
  // För nu skickar vi dem till en generell /leader-sida.
  return <Navigate to="/leader" replace />;
}
  
  // Om det är en vanlig användare, skicka till deras personliga dashboard
  return <Navigate to="/user/me" replace />;
};