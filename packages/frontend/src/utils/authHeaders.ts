export const AUTH_TOKEN_KEY = 'authToken';

/** Authorization-header från den inloggade sessionen. Tomt objekt om token saknas. */
export function getAuthHeaders(): Record<string, string> {
  const raw = localStorage.getItem(AUTH_TOKEN_KEY);
  const token = typeof raw === 'string' ? raw.trim() : '';
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
