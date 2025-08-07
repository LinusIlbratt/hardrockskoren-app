// hooks/useEventNotification.ts

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;

// STEG 1: Korrigera interfacet så att det matchar API:ets svar
interface NotificationData {
  hasNotification: boolean;
  newEventIds: string[];
  updatedEvents: Record<string, string[]>; // eventId -> ['title', 'eventDate']
}

const initialData: NotificationData = {
  hasNotification: false,
  newEventIds: [],
  updatedEvents: {}, // Detta ska vara ett tomt objekt
};

export const useEventNotification = (groupSlug: string | undefined) => {
  const [notificationData, setNotificationData] = useState<NotificationData>(initialData);
  const { user } = useAuth();
  const token = localStorage.getItem('authToken');

  const fetchNotificationStatus = useCallback(async () => {
    if (!groupSlug || !user || !token || user.role === 'admin' || user.role === 'leader') {
      setNotificationData(initialData);
      return;
    }
    try {
      const response = await axios.get<NotificationData>(
        `${API_BASE_URL}/groups/${groupSlug}/events/notification-status`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNotificationData(response.data);
    } catch (error) {
      console.error("Failed to fetch event notification status:", error);
      setNotificationData(initialData);
    }
  }, [groupSlug, user, token]);

  useEffect(() => {
    fetchNotificationStatus();
    const intervalId = setInterval(fetchNotificationStatus, 60000);
    return () => clearInterval(intervalId);
  }, [fetchNotificationStatus]);

  const markNewEventAsRead = useCallback(async (eventId: string) => {
    if (!token) return;
    
    // STEG 2: Korrigera logiken för hasNotification
    setNotificationData(prev => ({
      ...prev,
      newEventIds: prev.newEventIds.filter(id => id !== eventId),
      hasNotification: (prev.newEventIds.length - 1 > 0) || (Object.keys(prev.updatedEvents).length > 0)
    }));

    try {
      await axios.post(
        `${API_BASE_URL}/events/mark-as-viewed`, 
        { eventId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error("Failed to mark event as viewed:", error);
      fetchNotificationStatus();
    }
  }, [token, fetchNotificationStatus]);

  // STEG 3: TA BORT resetUpdateNotifications. Den passar inte den nya logiken.

  // Denna funktion är nu korrekt eftersom interfacet är rätt
  const markUpdateAsSeen = useCallback(async (eventId: string, eventUpdatedAt: string) => {
    if (!token) return;

    setNotificationData(prev => {
      const newUpdatedEvents = { ...prev.updatedEvents };
      delete newUpdatedEvents[eventId];
      return {
        ...prev,
        updatedEvents: newUpdatedEvents,
        hasNotification: prev.newEventIds.length > 0 || Object.keys(newUpdatedEvents).length > 0,
      };
    });

    try {
      await axios.post(
        `${API_BASE_URL}/events/${eventId}/mark-as-seen`,
        { updatedAt: eventUpdatedAt },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error("Failed to mark update as seen:", error);
      fetchNotificationStatus();
    }
  }, [token, fetchNotificationStatus]);

  // STEG 4: Returnera rätt funktioner
  return { notificationData, markNewEventAsRead, markUpdateAsSeen };
};