import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PageLoader } from '@/components/ui/loader/Loader';

export const ProtectedRoute = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }
  
  // Om vi har laddat klart och ingen användare finns, skicka till /login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Om användaren är inloggad, rendera innehållet (dvs. vår AppLayout)
  return <Outlet />;
};
