import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';

export const DashboardPage = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Vänta tills vi vet vem användaren är. Om vi fortfarande laddar, gör inget.
    if (isLoading || !user) {
      return;
    }

    // Fall 1: Användaren är en admin
    if (user.role === 'admin') {
      navigate('/admin/groups', { replace: true });
      return; // Avbryt för att undvika att annan logik körs
    }

    // Fall 2: Användaren är en leader eller en vanlig user
    if (user.role === 'leader' || user.role === 'user') {
      
      // Kontrollera om grupper finns och hur många de är
      if (user.groups && user.groups.length === 1) {
        // Användaren har exakt EN grupp, skicka dem direkt dit.
        const groupSlug = user.groups[0];
        
        // Bestäm destination baserat på roll
        const destination = user.role === 'leader' 
          ? `/leader/choir/${groupSlug}` // Körledare går till sin dashboard
          : `/user/me`; // Användare går till sin dashboard (som sedan använder grupp-datan)
        
        navigate(destination, { replace: true });

      } else {
        // Användaren har 0 eller 2+ grupper. Skicka dem till urvalssidan.
        navigate('/select-group', { replace: true });
      }
      return;
    }

    // Fallback om användaren har en okänd roll eller något annat oväntat händer
    // Du kan leda dem till en felsida eller tillbaka till login
    navigate('/login', { replace: true });

  }, [user, isLoading, navigate]); // Denna effekt körs när användarstatus ändras

  // Visa en enkel laddningsindikator medan logiken ovan körs.
  // Användaren kommer bara se detta en kort stund.
  return <div>Laddar...</div>;
};
