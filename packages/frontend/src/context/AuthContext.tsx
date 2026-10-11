import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { AuthContext as User } from '@hrk/core/types';
import { clearMediaUrlCache } from '@/services/mediaUrlService';
import { AUTH_TOKEN_KEY, getAuthHeaders as readAuthHeaders } from '@/utils/authHeaders';

function isSessionRejected(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}

// Ersätt detta med din riktiga API-URL från en .env-fil
const API_BASE_URL = import.meta.env.VITE_AUTH_API_URL;

interface IAuthContext {
  user: User | null;
  isLoading: boolean;
  /** Satt vid nätverksfel eller 5xx mot /me. Token och user lämnas kvar. */
  authError: string | null;
  login: (token: string) => Promise<void>; // Ny funktion för att hantera login
  logout: () => void;
  /** Försök /me igen med sparad token, utan att logga ut. */
  retryAuth: () => void;
  /**
   * Centraliserad Authorization-header för API-anrop.
   * Returnerar tomt objekt om ingen giltig token finns (anropa alltid med spridning: `{ ...getAuthHeaders() }`).
   */
  getAuthHeaders: () => Record<string, string>;
}

const AuthContext = createContext<IAuthContext | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Börja som true
  const [authError, setAuthError] = useState<string | null>(null);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    clearMediaUrlCache();
    setUser(null);
    setAuthError(null);
  }, []);

  // Funktion för att hämta användardata baserat på en token
  const fetchUser = useCallback(async (token: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser(response.data);
      setAuthError(null);
    } catch (error) {
      console.error("Failed to fetch user", error);
      if (isSessionRejected(error)) {
        logout();
        return;
      }
      setAuthError('Kunde inte nå servern. Försök igen om en stund.');
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  // Denna körs bara en gång när appen laddas
  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      fetchUser(token);
    } else {
      setIsLoading(false);
    }
  }, [fetchUser]);

  // Den nya login-funktionen. Den tar emot en token, sparar den,
  // och hämtar sedan användardatan för att uppdatera appens state.
  const login = async (token: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setAuthError(null);
    setIsLoading(true);
    await fetchUser(token);
  };

  const retryAuth = useCallback(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      setAuthError(null);
      setIsLoading(false);
      return;
    }
    setAuthError(null);
    setIsLoading(true);
    void fetchUser(token);
  }, [fetchUser]);

  const getAuthHeaders = useCallback((): Record<string, string> => readAuthHeaders(), []);

  return (
    <AuthContext.Provider value={{ user, isLoading, authError, login, logout, retryAuth, getAuthHeaders }}>
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