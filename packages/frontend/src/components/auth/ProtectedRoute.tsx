import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

export const ProtectedRoute = () => {
  const { user, isLoading } = useAuth();

  // Om vi fortfarande kollar om användaren är inloggad, visa en laddningstext
  if (isLoading) {
    return <div>Laddar session...</div>;
  }
  
  // Om vi har laddat klart och ingen användare finns, skicka till /login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Om användaren är inloggad, rendera innehållet (dvs. vår AppLayout)
  return <Outlet />;
};
