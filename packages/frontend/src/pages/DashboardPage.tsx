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
  
  // Om det är en vanlig användare, skicka till deras personliga dashboard
  return <Navigate to="/user/me" replace />;
};