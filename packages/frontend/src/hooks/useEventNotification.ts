import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;

interface NotificationData {
  hasNotification: boolean;
  newEventIds: string[];
  updatedEvents: Record<string, string[]>;
}

const initialData: NotificationData = {
  hasNotification: false,
  newEventIds: [],
  updatedEvents: {},
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
    
    // KORRIGERING: Denna funktion ska ENDAST påverka newEventIds.
    // updatedEvents-objektet ska lämnas helt orört.
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
  
  const markGeneralUpdateAsSeen = useCallback(async (eventId: string, eventUpdatedAt: string) => {
    if (!token) return;

    setNotificationData(prev => {
      const newUpdatedEvents = { ...prev.updatedEvents };
      const remainingFields = newUpdatedEvents[eventId]?.filter(field => field === 'description');
      
      if (remainingFields && remainingFields.length > 0) {
        newUpdatedEvents[eventId] = remainingFields;
      } else {
        delete newUpdatedEvents[eventId];
      }

      return {
        ...prev,
        updatedEvents: newUpdatedEvents,
        hasNotification: prev.newEventIds.length > 0 || Object.keys(newUpdatedEvents).length > 0,
      };
    });

    try {
      await axios.post(
        `${API_BASE_URL}/events/${eventId}/mark-general-as-seen`,
        { updatedAt: eventUpdatedAt },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error("Failed to mark general update as seen:", error);
      fetchNotificationStatus();
    }
  }, [token, fetchNotificationStatus]);

  const markDescriptionUpdateAsSeen = useCallback(async (eventId: string, eventDescriptionUpdatedAt: string | null) => {
    if (!token || !eventDescriptionUpdatedAt) return;

     setNotificationData(prev => {
      const newUpdatedEvents = { ...prev.updatedEvents };
      const remainingFields = newUpdatedEvents[eventId]?.filter(field => field !== 'description');
      
      if (remainingFields && remainingFields.length > 0) {
        newUpdatedEvents[eventId] = remainingFields;
      } else {
        delete newUpdatedEvents[eventId];
      }
      
      return {
        ...prev,
        updatedEvents: newUpdatedEvents,
        hasNotification: prev.newEventIds.length > 0 || Object.keys(newUpdatedEvents).length > 0,
      };
    });
    
    try {
      await axios.post(
        `${API_BASE_URL}/events/${eventId}/mark-description-as-seen`,
        { descriptionUpdatedAt: eventDescriptionUpdatedAt },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error("Failed to mark description update as seen:", error);
      fetchNotificationStatus();
    }
  }, [token, fetchNotificationStatus]);

  return { 
    notificationData, 
    markNewEventAsRead, 
    markGeneralUpdateAsSeen, 
    markDescriptionUpdateAsSeen 
  };
};