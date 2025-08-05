// hooks/useEventNotification.ts

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;

// 1. KORREKT INTERFACE SOM MATCHAR BACKEND
interface NotificationData {
  hasNotification: boolean;
  newEventIds: string[];
  updatedEventIds: string[];
}

const initialData: NotificationData = {
  hasNotification: false,
  newEventIds: [],
  updatedEventIds: [],
};

export const useEventNotification = (groupSlug: string | undefined) => {
  const [notificationData, setNotificationData] = useState<NotificationData>(initialData);
  const { user } = useAuth();
  const token = localStorage.getItem('authToken');

  // Funktion för att hämta status från backend
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

  // Effekt för att hämta data vid start och sedan polla
  useEffect(() => {
    fetchNotificationStatus();
    const intervalId = setInterval(fetchNotificationStatus, 60000); // Poll every 60 seconds
    return () => clearInterval(intervalId);
  }, [fetchNotificationStatus]);

  // 2. KORREKT FUNKTION FÖR ATT MARKERA ETT NYTT EVENT SOM LÄST
  const markNewEventAsRead = useCallback(async (eventId: string) => {
    if (!token) return;
    
    // Uppdatera lokalt direkt för snabb UI-respons
    setNotificationData(prev => ({
      ...prev,
      newEventIds: prev.newEventIds.filter(id => id !== eventId),
      hasNotification: prev.newEventIds.length - 1 > 0 || prev.updatedEventIds.length > 0
    }));

    try {
      // Anropa backend för att göra ändringen permanent
      await axios.post(
        `${API_BASE_URL}/events/mark-as-viewed`, 
        { eventId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error("Failed to mark event as viewed:", error);
      // Om anropet misslyckas, hämta den sanna statusen från servern igen
      fetchNotificationStatus();
    }
  }, [token, fetchNotificationStatus]);

  // 3. NY FUNKTION FÖR ATT NOLLSTÄLLA ALLA "UPPDATERAD"-NOTISER
  const resetUpdateNotifications = useCallback(async () => {
    if (!token) return;

    // Uppdatera lokalt direkt
    setNotificationData(prev => ({
      ...prev,
      updatedEventIds: [],
      hasNotification: prev.newEventIds.length > 0
    }));

    try {
      // Anropa den nya endpointen
      await axios.post(
        `${API_BASE_URL}/events/reset-view-timestamp`,
        {}, // Ingen body behövs
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error("Failed to reset update notifications:", error);
      fetchNotificationStatus();
    }
  }, [token, fetchNotificationStatus]);

  return { 
    notificationData, 
    markNewEventAsRead, 
    resetUpdateNotifications 
  };
};