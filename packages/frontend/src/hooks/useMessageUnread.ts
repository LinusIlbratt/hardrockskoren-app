import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { getUnreadStatus, type UnreadStatus } from "@/services/messageService";

const initial: UnreadStatus = { hasUnread: false, unreadCount: 0 };

/**
 * Polls Aktuellt unread-status for a choir.
 * Unlike event notifications, this includes leaders (and admins in group context).
 */
export const useMessageUnread = (groupSlug: string | undefined) => {
  const [status, setStatus] = useState<UnreadStatus>(initial);
  const { user } = useAuth();
  const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;

  const refetch = useCallback(async () => {
    if (!groupSlug || !user || !token) {
      setStatus(initial);
      return;
    }
    try {
      const data = await getUnreadStatus(groupSlug);
      setStatus(data);
    } catch (error) {
      console.error("Failed to fetch message unread status:", error);
      setStatus(initial);
    }
  }, [groupSlug, user, token]);

  useEffect(() => {
    refetch();
    const intervalId = setInterval(refetch, 60000);
    return () => clearInterval(intervalId);
  }, [refetch]);

  return { unreadStatus: status, refetchUnread: refetch };
};
