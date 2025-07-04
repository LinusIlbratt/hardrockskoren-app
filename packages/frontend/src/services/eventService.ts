import type { Event } from '@/types';
import axios from 'axios';

// OBS! Kontrollera att VITE_EVENT_API_URL är rätt namn på miljövariabeln i din .env-fil
const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;

// Typ för datan som skickas när man skapar/uppdaterar ett enstaka event.
type EventData = Partial<Event>;

// NY TYP: Definierar "receptet" som skickas till batch-endpointet.
interface BatchCreatePayload {
    title: string;
    eventType: 'CONCERT' | 'REHEARSAL';
    description?: string;
    startDate: string;
    endDate: string;
    time: string;
    selectedWeekdays: number[];
}


/**
 * Skapar en instans av axios med rätt bas-URL och autentisering.
 * @param token - Autentiseringstoken för API-anropet.
 * @returns En konfigurerad axios-instans.
 */
const getApiClient = (token: string) => {
  if (!API_BASE_URL) {
    throw new Error('API Base URL is not configured. Check your .env file.');
  }
  
  return axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
};

/**
 * Hämtar en lista över alla events för en specifik grupp.
 */
export const listEvents = async (groupSlug: string, token:string): Promise<Event[]> => {
  const apiClient = getApiClient(token);
  const response = await apiClient.get(`/groups/${groupSlug}/events`);
  return response.data;
};

/**
 * Skapar ett nytt, enstaka event för en specifik grupp.
 */
export const createEvent = async (groupSlug: string, eventData: EventData, token: string): Promise<Event> => {
  const apiClient = getApiClient(token);
  const response = await apiClient.post(`/groups/${groupSlug}/events`, eventData);
  return response.data;
};

/**
 * Hämtar ett specifikt event för en grupp baserat på eventId.
 */
export const updateEvent = async (groupSlug: string, eventId: string, eventData: EventData, token: string): Promise<Event> => {
  const apiClient = getApiClient(token);
  const response = await apiClient.put(`/groups/${groupSlug}/events/${eventId}`, eventData);
  return response.data;
};

/**
 * Hämtar ett specifikt event för en grupp baserat på eventId.
 */
export const deleteEvent = async (groupSlug: string, eventId: string, token: string): Promise<void> => {
  const apiClient = getApiClient(token);
  await apiClient.delete(`/groups/${groupSlug}/events/${eventId}`);
};

/**
 * Skapar flera events i en batch för en specifik grupp.
 * @param groupSlug - Slug för gruppen där events ska skapas.
 * @param batchData - Data som beskriver de events som ska skapas i batchen.
 * @param token - Autentiseringstoken för API-anropet.
 */
export const batchCreateEvents = async (groupSlug: string, batchData: BatchCreatePayload, token: string) => {
  const apiClient = getApiClient(token);
  // Anropet går till: POST /groups/{groupSlug}/events/batch
  const response = await apiClient.post(`/groups/${groupSlug}/events/batch`, batchData);
  return response.data;
};
