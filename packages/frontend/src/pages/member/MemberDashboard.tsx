// Importera din AuthContext-typ
import type { AuthContext } from '@hrk/core/types';

// Definiera vilka props komponenten kan ta emot
type MemberDashboardPageProps = {
  user: AuthContext;
};

// Använd props-definitionen i din komponent
export const MemberDashboard = ({ user }: MemberDashboardPageProps) => {
  return (
    <div>
      <h1>Mina Noter</h1>
      <p>Välkommen, medlem i kören: {user.group || 'Okänd kör'}</p>
      {/* Här kommer listan med material att renderas */}
    </div>
  );
};