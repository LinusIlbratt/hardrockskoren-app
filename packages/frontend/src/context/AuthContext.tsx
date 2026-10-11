import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import type { AuthContext as User, RoleTypes } from '@hrk/core/types';
import { clearMediaUrlCache } from '@/services/mediaUrlService';
import { AUTH_TOKEN_KEY, getAuthHeaders as readAuthHeaders } from '@/utils/authHeaders';
import {
  readStoredViewAsRole,
  writeLastActiveChoirSlug,
  writeStoredViewAsRole,
  type ViewAsRole,
} from '@/utils/rolePreview';

function isSessionRejected(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === 401 || status === 403;
}

function isViewAsRole(role: ViewAsRole): role is 'leader' | 'user' {
  return role === 'leader' || role === 'user';
}

// Ersätt detta med din riktiga API-URL från en .env-fil
const API_BASE_URL = import.meta.env.VITE_AUTH_API_URL;

interface IAuthContext {
  /** Profil från /me, med `role` satt till effectiveRole så vyerna följer simuleringen. */
  user: User | null;
  /** Cognito-rollen. Ändras inte av rollväxlaren. */
  realRole: RoleTypes | null;
  /** Simulerad vy. null när admin ser sin egen vy, eller när användaren inte är admin. */
  viewAsRole: ViewAsRole;
  /** viewAsRole när en admin simulerar, annars realRole. */
  effectiveRole: RoleTypes | null;
  /**
   * Byt visningsläge. Ignoreras om den verkliga rollen inte är admin.
   * Påverkar bara gränssnittet — token och backend-anrop är oförändrade.
   */
  setViewAsRole: (role: ViewAsRole) => void;
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
  const [realUser, setRealUser] = useState<User | null>(null);
  const [viewAsRoleState, setViewAsRoleState] = useState<ViewAsRole>(() => readStoredViewAsRole());
  const [isLoading, setIsLoading] = useState(true); // Börja som true
  const [authError, setAuthError] = useState<string | null>(null);
  const realUserRef = useRef<User | null>(null);
  realUserRef.current = realUser;

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    writeStoredViewAsRole(null);
    writeLastActiveChoirSlug(null);
    clearMediaUrlCache();
    setRealUser(null);
    setViewAsRoleState(null);
    setAuthError(null);
  }, []);

  // Funktion för att hämta användardata baserat på en token
  const fetchUser = useCallback(async (token: string) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRealUser(response.data);
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

  const realRole: RoleTypes | null = realUser?.role ?? null;

  // En icke-admin ska aldrig ärva en sparad simulering.
  useEffect(() => {
    if (!realUser || realUser.role === 'admin' || !viewAsRoleState) return;
    writeStoredViewAsRole(null);
    setViewAsRoleState(null);
  }, [realUser, viewAsRoleState]);

  const setViewAsRole = useCallback((role: ViewAsRole) => {
    if (realUserRef.current?.role !== 'admin') return;
    if (role !== null && !isViewAsRole(role)) return;
    writeStoredViewAsRole(role);
    setViewAsRoleState(role);
  }, []);

  const viewAsRole: ViewAsRole = realRole === 'admin' && isViewAsRole(viewAsRoleState)
    ? viewAsRoleState
    : null;
  const effectiveRole: RoleTypes | null = viewAsRole ?? realRole;

  const user = useMemo<User | null>(() => {
    if (!realUser || !effectiveRole) return realUser;
    if (realUser.role === effectiveRole) return realUser;
    return { ...realUser, role: effectiveRole };
  }, [realUser, effectiveRole]);

  // Den nya login-funktionen. Den tar emot en token, sparar den,
  // och hämtar sedan användardatan för att uppdatera appens state.
  const login = useCallback(async (token: string) => {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    setAuthError(null);
    setIsLoading(true);
    await fetchUser(token);
  }, [fetchUser]);

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

  const value = useMemo<IAuthContext>(() => ({
    user,
    realRole,
    viewAsRole,
    effectiveRole,
    setViewAsRole,
    isLoading,
    authError,
    login,
    logout,
    retryAuth,
    getAuthHeaders,
  }), [user, realRole, viewAsRole, effectiveRole, setViewAsRole, isLoading, authError, login, logout, retryAuth, getAuthHeaders]);

  return (
    <AuthContext.Provider value={value}>
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

export type { ViewAsRole };
