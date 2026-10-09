import axios from 'axios';

function readServerMessage(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('message' in data)) return null;
  const message = (data as { message: unknown }).message;
  if (typeof message !== 'string') return null;
  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Läser serverns `message` när den finns, annars Error.message, annars fallback.
 * Status-specifika texter (401, 404, nätverk) hör hemma hos anroparen.
 */
export function getApiErrorMessage(error: unknown, fallback = 'Något gick fel.'): string {
  if (axios.isAxiosError(error)) {
    const serverMessage = readServerMessage(error.response?.data);
    if (serverMessage) return serverMessage;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}
