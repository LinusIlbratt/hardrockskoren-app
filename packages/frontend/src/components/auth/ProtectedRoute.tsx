import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { PageLoader } from '@/components/ui/loader/Loader';

export const ProtectedRoute = () => {
  const { user, isLoading, authError, retryAuth, logout } = useAuth();
  const navigate = useNavigate();

  const loginAgain = () => {
    logout();
    navigate('/login', { replace: true });
  };

  if (isLoading) {
    return <PageLoader />;
  }

  if (!user && authError) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
        <div>
          <p>{authError}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.25rem', alignItems: 'center' }}>
            <Button type="button" variant={ButtonVariant.Primary} onClick={retryAuth}>
              Försök igen
            </Button>
            <Button type="button" variant={ButtonVariant.Ghost} onClick={loginAgain}>
              Logga in igen
            </Button>
          </div>
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
