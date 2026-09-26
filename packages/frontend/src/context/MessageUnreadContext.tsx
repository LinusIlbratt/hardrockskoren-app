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
import { useAuth } from "@/context/AuthContext";
import {
  getUnreadStatus,
  type UnreadStatus,
} from "@/services/messageService";

const POLL_INTERVAL_MS = 60_000;

const initial: UnreadStatus = { hasUnread: false, unreadCount: 0 };

type MessageUnreadContextValue = {
  unreadStatus: UnreadStatus;
  /** Re-fetch from API (e.g. after mark-as-read). Updates nav + page together. */
  refetchUnread: () => Promise<void>;
  /**
   * Optimistic local decrement before/while mark-as-read runs.
   * Pair with refetchUnread after a successful mark for server truth.
   */
  decrementUnreadOptimistic: () => void;
};

const MessageUnreadContext = createContext<MessageUnreadContextValue | null>(
  null
);

type ProviderProps = {
  groupSlug: string | undefined;
  children: ReactNode;
};

/**
 * One poller per choir for Aktuellt unread badge.
 * Shared by nav + Aktuellt page so the red dot clears immediately after read.
 */
export function MessageUnreadProvider({ groupSlug, children }: ProviderProps) {
  const [status, setStatus] = useState<UnreadStatus>(initial);
  const { user } = useAuth();
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;

  /** Optimistic decrements not yet confirmed by a successful refetch. */
  const pendingDecrementsRef = useRef(0);
  const fetchGenRef = useRef(0);

  const applyServerStatus = useCallback((data: UnreadStatus) => {
    const pending = pendingDecrementsRef.current;
    if (pending <= 0) {
      setStatus(data);
      return;
    }
    const unreadCount = Math.max(0, data.unreadCount - pending);
    setStatus({
      unreadCount,
      hasUnread: unreadCount > 0,
    });
  }, []);

  const refetch = useCallback(async () => {
    if (!groupSlug || !user || !token) {
      setStatus(initial);
      pendingDecrementsRef.current = 0;
      return;
    }

    const gen = ++fetchGenRef.current;
    try {
      const data = await getUnreadStatus(groupSlug);
      if (gen !== fetchGenRef.current) return;
      // Successful server read clears optimistic debt — server is source of truth.
      pendingDecrementsRef.current = 0;
      setStatus(data);
    } catch (error) {
      // Keep last known status — clearing on network errors hides the red
      // dot and makes users think there is nothing new to read.
      console.error("Failed to fetch message unread status:", error);
    }
  }, [groupSlug, user, token]);

  useEffect(() => {
    pendingDecrementsRef.current = 0;
    setStatus(initial);

    if (!groupSlug || !user || !token) return undefined;

    void refetch();
    const intervalId = window.setInterval(() => {
      void (async () => {
        if (!groupSlug || !user || !token) return;
        const gen = ++fetchGenRef.current;
        try {
          const data = await getUnreadStatus(groupSlug);
          if (gen !== fetchGenRef.current) return;
          applyServerStatus(data);
        } catch (error) {
          console.error("Failed to fetch message unread status:", error);
        }
      })();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [groupSlug, user, token, refetch, applyServerStatus]);

  const decrementUnreadOptimistic = useCallback(() => {
    pendingDecrementsRef.current += 1;
    setStatus((prev) => {
      const unreadCount = Math.max(0, prev.unreadCount - 1);
      return { unreadCount, hasUnread: unreadCount > 0 };
    });
  }, []);

  const value = useMemo(
    () => ({
      unreadStatus: status,
      refetchUnread: refetch,
      decrementUnreadOptimistic,
    }),
    [status, refetch, decrementUnreadOptimistic]
  );

  return (
    <MessageUnreadContext.Provider value={value}>
      {children}
    </MessageUnreadContext.Provider>
  );
}

export function useMessageUnread(): MessageUnreadContextValue {
  const ctx = useContext(MessageUnreadContext);
  if (!ctx) {
    throw new Error(
      "useMessageUnread must be used within MessageUnreadProvider"
    );
  }
  return ctx;
}
