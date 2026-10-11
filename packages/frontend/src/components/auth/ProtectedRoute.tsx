import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { PageLoader } from '@/components/ui/loader/Loader';

export const ProtectedRoute = () => {
  const { user, isLoading, authError, retryAuth } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!user && authError) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
        <div>
          <p>{authError}</p>
          <Button type="button" variant={ButtonVariant.Primary} onClick={retryAuth}>
            Försök igen
          </Button>
        </div>
      </main>
    );
  }
  
  // Om vi har laddat klart och ingen användare finns, skicka till /login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Om användaren är inloggad, rendera innehållet (dvs. vår AppLayout)
  return <Outlet />;
};
