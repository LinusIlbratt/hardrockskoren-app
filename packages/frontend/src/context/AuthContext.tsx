import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
// Importera din delade typ
import type { AuthContext as User } from '@hrk/core/types';

// Ersätt detta med din riktiga API-URL från en .env-fil
const API_BASE_URL = import.meta.env.VITE_AUTH_API_URL;

interface IAuthContext {
  user: User | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>; // Ny funktion för att hantera login
  logout: () => void;
}

const AuthContext = createContext<IAuthContext | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Börja som true

  // Funktion för att hämta användardata baserat på en token
  const fetchUser = useCallback(async (token: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data);
    } catch (error) {
      console.error("Failed to fetch user", error);
      // Om /me-anropet misslyckas, ta bort den ogiltiga token
      localStorage.removeItem('authToken');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Denna körs bara en gång när appen laddas
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      fetchUser(token);
    } else {
      setIsLoading(false);
    }
  }, [fetchUser]);

  // Den nya login-funktionen. Den tar emot en token, sparar den,
  // och hämtar sedan användardatan för att uppdatera appens state.
  const login = async (token: string) => {
    localStorage.setItem('authToken', token);
    setIsLoading(true);
    await fetchUser(token);
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Din custom hook är oförändrad
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};