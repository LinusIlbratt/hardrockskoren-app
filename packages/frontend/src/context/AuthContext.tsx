import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
// Importera din delade typ
import type { AuthContext as User } from '@hrk/core/types';

// Ersätt detta med din riktiga API-URL från en .env-fil
const API_BASE_URL = 'https://ved08b2lvb.execute-api.eu-north-1.amazonaws.com';

// Definiera formen på vårt context
interface IAuthContext {
  user: User | null;
  isLoading: boolean;
  logout: () => void;
}

// Skapa själva contextet
const AuthContext = createContext<IAuthContext | undefined>(undefined);

// Skapa en "Provider". Denna komponent kommer att svepa in hela din app.
// Dess jobb är att hämta användardata och göra den tillgänglig för alla barn-komponenter.
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Börja som true

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        // Anropa din GET /me-endpoint för att hämta fullständig användardata
        const response = await axios.get(`${API_BASE_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUser(response.data);
      } catch (error) {
        console.error("Failed to fetch user", error);
        // Om anropet misslyckas (t.ex. ogiltig token), ta bort den och logga ut
        localStorage.removeItem('authToken');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, []);

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
    // Omdirigering hanteras på sid-nivå
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Skapa en custom hook för enkel åtkomst
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};