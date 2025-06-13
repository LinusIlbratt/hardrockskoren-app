import { jwtDecode } from 'jwt-decode';
// Importera din AuthContext-typ från ditt core-paket
import type { AuthContext } from '@hrk/core/types';

export const useAuth = (): { user: AuthContext | null } => {
  // Hämta token från localStorage
  const token = localStorage.getItem('authToken');

  if (!token) {
    // Om ingen token finns, finns ingen användare
    return { user: null };
  }

  try {
    // Avkoda token för att få tillgång till payload (innehållet)
    const decodedToken: AuthContext = jwtDecode(token);
    
    // Vi kan lägga till en extra koll för att se om token har gått ut
    // const isExpired = decodedToken.exp * 1000 < Date.now();
    // if (isExpired) return { user: null };

    return { user: decodedToken };
  } catch (error) {
    console.error("Failed to decode token:", error);
    // Om token är ogiltig, behandla det som att ingen användare är inloggad
    return { user: null };
  }
};