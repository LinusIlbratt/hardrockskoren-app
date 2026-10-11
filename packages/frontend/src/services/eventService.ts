import type { Event, EventType } from '@/types';
import { createAuthedClient } from '@/services/apiClient';

const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;

type EventData = Partial<Event>;

interface BatchCreatePayload {
    title: string;
    eventType: EventType;
    description?: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    selectedWeekdays: number[];
    repetitionInterval: number;
}

/**
 * Token är valfri: skickas den med vinner den över sessionen.
 * Utan token läser klienten Authorization via getAuthHeaders().
 */
const getApiClient = (token?: string) => {
  if (!API_BASE_URL) {
    throw new Error('API Base URL is not configured. Check your .env file.');
  }

  return createAuthedClient(API_BASE_URL, token);
};

/**
 * Hämtar en lista över alla events för en specifik kör.
 */
export const listEvents = async (
  groupSlug: string,
  token?: string,
  options?: { signal?: AbortSignal }
): Promise<Event[]> => {
  const apiClient = getApiClient(token);
  const response = await apiClient.get(`/groups/${groupSlug}/events`, {
    signal: options?.signal,
  });
  return response.data;
};

/**
 * Skapar ett nytt, enstaka event för en specifik kör.
 */
export const createEvent = async (groupSlug: string, eventData: EventData, token?: string): Promise<Event> => {
  const apiClient = getApiClient(token);
  const response = await apiClient.post(`/groups/${groupSlug}/events`, eventData);
  return response.data;
};

/**
 * Hämtar ett specifikt event för en kör baserat på eventId.
 */
export const updateEvent = async (groupSlug: string, eventId: string, eventData: EventData, token?: string): Promise<Event> => {
  const apiClient = getApiClient(token);
  const response = await apiClient.put(`/groups/${groupSlug}/events/${eventId}`, eventData);
  return response.data;
};

/**
 * Hämtar ett specifikt event för en kör baserat på eventId.
 */
export const deleteEvent = async (groupSlug: string, eventId: string, token?: string): Promise<void> => {
  const apiClient = getApiClient(token);
  await apiClient.delete(`/groups/${groupSlug}/events/${eventId}`);
};

/**
 * Skapar flera events i en batch för en specifik kör.
 * @param groupSlug - Slug för kören där events ska skapas.
 * @param batchData - Data som beskriver de events som ska skapas i batchen.
 * @param token - Autentiseringstoken för API-anropet.
 */
export const batchCreateEvents = async (groupSlug: string, batchData: BatchCreatePayload, token?: string) => {
  const apiClient = getApiClient(token);
  // Anropet går till: POST /groups/{groupSlug}/events/batch
  const response = await apiClient.post(`/groups/${groupSlug}/events/batch`, batchData);
  return response.data;
};
