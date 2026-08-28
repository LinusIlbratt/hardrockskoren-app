import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";

const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;
const POLL_INTERVAL_MS = 60_000;

export type EventNotificationData = {
  hasNotification: boolean;
  newEventIds: string[];
  updatedEvents: Record<string, string[]>;
};

const initialData: EventNotificationData = {
  hasNotification: false,
  newEventIds: [],
  updatedEvents: {},
};

type EventNotificationContextValue = {
  notificationData: EventNotificationData;
  markNewEventAsRead: (eventId: string) => Promise<void>;
  markGeneralUpdateAsSeen: (
    eventId: string,
    eventUpdatedAt: string
  ) => Promise<void>;
  markDescriptionUpdateAsSeen: (
    eventId: string,
    eventDescriptionUpdatedAt: string | null
  ) => Promise<void>;
};

const EventNotificationContext =
  createContext<EventNotificationContextValue | null>(null);

function withHasNotification(
  data: Omit<EventNotificationData, "hasNotification">
): EventNotificationData {
  return {
    ...data,
    hasNotification:
      data.newEventIds.length > 0 ||
      Object.keys(data.updatedEvents).length > 0,
  };
}

function applyPendingRemovals(
  server: EventNotificationData,
  pendingNewIds: Set<string>,
  pendingFields: Map<string, Set<string>>
): EventNotificationData {
  const newEventIds = server.newEventIds.filter((id) => !pendingNewIds.has(id));
  const updatedEvents: Record<string, string[]> = {};

  for (const [eventId, fields] of Object.entries(server.updatedEvents)) {
    const remove = pendingFields.get(eventId);
    const remaining = remove
      ? fields.filter((field) => !remove.has(field))
      : fields;
    if (remaining.length > 0) {
      updatedEvents[eventId] = remaining;
    }
  }

  return withHasNotification({ newEventIds, updatedEvents });
}

type ProviderProps = {
  groupSlug: string | undefined;
  children: ReactNode;
};

/**
 * One poller per choir for event badges. Optimistic marks update shared state
 * so nav + event page stay in sync without duplicate 60s polls.
 */
export function EventNotificationProvider({
  groupSlug,
  children,
}: ProviderProps) {
  const [notificationData, setNotificationData] =
    useState<EventNotificationData>(initialData);
  const { user } = useAuth();
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;

  const pendingNewIdsRef = useRef(new Set<string>());
  const pendingFieldsRef = useRef(new Map<string, Set<string>>());
  const fetchGenRef = useRef(0);

  const canFetch =
    Boolean(groupSlug) &&
    Boolean(user) &&
    Boolean(token) &&
    user?.role !== "admin" &&
    user?.role !== "leader";

  const fetchNotificationStatus = useCallback(async () => {
    if (!canFetch || !groupSlug || !token) {
      setNotificationData(initialData);
      return;
    }

    const gen = ++fetchGenRef.current;
    try {
      const response = await axios.get<EventNotificationData>(
        `${API_BASE_URL}/groups/${groupSlug}/events/notification-status`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (gen !== fetchGenRef.current) return;
      setNotificationData(
        applyPendingRemovals(
          response.data,
          pendingNewIdsRef.current,
          pendingFieldsRef.current
        )
      );
    } catch (error) {
      if (gen !== fetchGenRef.current) return;
      console.error("Failed to fetch event notification status:", error);
      setNotificationData(initialData);
    }
  }, [canFetch, groupSlug, token]);

  useEffect(() => {
    pendingNewIdsRef.current.clear();
    pendingFieldsRef.current.clear();
    setNotificationData(initialData);

    if (!canFetch) return undefined;

    void fetchNotificationStatus();
    const intervalId = window.setInterval(() => {
      void fetchNotificationStatus();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [canFetch, fetchNotificationStatus, groupSlug]);

  const markNewEventAsRead = useCallback(
    async (eventId: string) => {
      if (!token) return;

      pendingNewIdsRef.current.add(eventId);
      setNotificationData((prev) =>
        withHasNotification({
          newEventIds: prev.newEventIds.filter((id) => id !== eventId),
          updatedEvents: prev.updatedEvents,
        })
      );

      try {
        await axios.post(
          `${API_BASE_URL}/events/mark-as-viewed`,
          { eventId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        pendingNewIdsRef.current.delete(eventId);
      } catch (error) {
        console.error("Failed to mark event as viewed:", error);
        pendingNewIdsRef.current.delete(eventId);
        await fetchNotificationStatus();
      }
    },
    [token, fetchNotificationStatus]
  );

  const markGeneralUpdateAsSeen = useCallback(
    async (eventId: string, eventUpdatedAt: string) => {
      if (!token) return;

      setNotificationData((prev) => {
        const pending =
          pendingFieldsRef.current.get(eventId) ?? new Set<string>();
        for (const field of prev.updatedEvents[eventId] ?? []) {
          if (field !== "description") pending.add(field);
        }
        pendingFieldsRef.current.set(eventId, pending);

        const newUpdatedEvents = { ...prev.updatedEvents };
        const remainingFields = newUpdatedEvents[eventId]?.filter(
          (field) => field === "description"
        );

        if (remainingFields && remainingFields.length > 0) {
          newUpdatedEvents[eventId] = remainingFields;
        } else {
          delete newUpdatedEvents[eventId];
        }

        return withHasNotification({
          newEventIds: prev.newEventIds,
          updatedEvents: newUpdatedEvents,
        });
      });

      try {
        await axios.post(
          `${API_BASE_URL}/events/${eventId}/mark-general-as-seen`,
          { updatedAt: eventUpdatedAt },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const next = pendingFieldsRef.current.get(eventId);
        if (next) {
          for (const field of [...next]) {
            if (field !== "description") next.delete(field);
          }
          if (next.size === 0) pendingFieldsRef.current.delete(eventId);
        }
      } catch (error) {
        console.error("Failed to mark general update as seen:", error);
        pendingFieldsRef.current.delete(eventId);
        await fetchNotificationStatus();
      }
    },
    [token, fetchNotificationStatus]
  );

  const markDescriptionUpdateAsSeen = useCallback(
    async (eventId: string, eventDescriptionUpdatedAt: string | null) => {
      if (!token || !eventDescriptionUpdatedAt) return;

      const pending = pendingFieldsRef.current.get(eventId) ?? new Set<string>();
      pending.add("description");
      pendingFieldsRef.current.set(eventId, pending);

      setNotificationData((prev) => {
        const newUpdatedEvents = { ...prev.updatedEvents };
        const remainingFields = newUpdatedEvents[eventId]?.filter(
          (field) => field !== "description"
        );

        if (remainingFields && remainingFields.length > 0) {
          newUpdatedEvents[eventId] = remainingFields;
        } else {
          delete newUpdatedEvents[eventId];
        }

        return withHasNotification({
          newEventIds: prev.newEventIds,
          updatedEvents: newUpdatedEvents,
        });
      });

      try {
        await axios.post(
          `${API_BASE_URL}/events/${eventId}/mark-description-as-seen`,
          { descriptionUpdatedAt: eventDescriptionUpdatedAt },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const next = pendingFieldsRef.current.get(eventId);
        if (next) {
          next.delete("description");
          if (next.size === 0) pendingFieldsRef.current.delete(eventId);
        }
      } catch (error) {
        console.error("Failed to mark description update as seen:", error);
        pendingFieldsRef.current.delete(eventId);
        await fetchNotificationStatus();
      }
    },
    [token, fetchNotificationStatus]
  );

  const value = useMemo(
    () => ({
      notificationData,
      markNewEventAsRead,
      markGeneralUpdateAsSeen,
      markDescriptionUpdateAsSeen,
    }),
    [
      notificationData,
      markNewEventAsRead,
      markGeneralUpdateAsSeen,
      markDescriptionUpdateAsSeen,
    ]
  );

  return (
    <EventNotificationContext.Provider value={value}>
      {children}
    </EventNotificationContext.Provider>
  );
}

export function useEventNotification(): EventNotificationContextValue {
  const ctx = useContext(EventNotificationContext);
  if (!ctx) {
    throw new Error(
      "useEventNotification must be used within EventNotificationProvider"
    );
  }
  return ctx;
}
