import axios from 'axios';
import { getApiErrorMessage } from '@/utils/apiError';

function readNestedErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('error' in data)) return null;
  const nested = (data as { error?: unknown }).error;
  if (!nested || typeof nested !== 'object' || !('message' in nested)) return null;
  const message = (nested as { message?: unknown }).message;
  if (typeof message !== 'string') return null;
  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Serverns message visas när den finns. Axios egna status-text byts mot fallback
 * så befintliga svenska feltexter ligger kvar när API:t inte skickar message.
 */
export function materialActionError(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const serverMessage = getApiErrorMessage(error, '');
    const data = error.response?.data;
    const hasOwnServerMessage =
      !!data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof (data as { message?: unknown }).message === 'string' &&
      (data as { message: string }).message.trim().length > 0;
    if (hasOwnServerMessage) return serverMessage;
    return readNestedErrorMessage(data) ?? fallback;
  }
  return getApiErrorMessage(error, fallback);
}
