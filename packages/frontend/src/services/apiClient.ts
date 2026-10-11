import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { getAuthHeaders } from '@/utils/authHeaders';

/**
 * Axios-klient med JSON och sessionstoken.
 * En explicit token vinner över sessionen, så befintliga anrop som skickar token behåller samma header.
 */
export function createAuthedClient(baseURL: string, token?: string): AxiosInstance {
  const client = axios.create({
    baseURL: baseURL.replace(/\/$/, ''),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const explicit = token?.trim() ? `Bearer ${token.trim()}` : undefined;
    const authorization = explicit || getAuthHeaders().Authorization;
    if (authorization) {
      config.headers.set('Authorization', authorization);
    }
    return config;
  });

  return client;
}
