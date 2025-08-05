// src/hooks/useMarkEventsAsViewed.ts

import { useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;

export const useMarkEventsAsViewed = () => {
  // ÄNDRING: Funktionen accepterar nu ett eventId
  const markAsViewed = useCallback(async (eventId: string) => {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    try {
      // Skicka med eventId i anropets body
      await axios.post(
        `${API_BASE_URL}/events/mark-as-viewed`,
        { eventId }, // Skicka med ID
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`Event ${eventId} marked as viewed.`);
    } catch (error) {
      console.error('Failed to mark event as viewed:', error);
    }
  }, []);

  return { markAsViewed };
};