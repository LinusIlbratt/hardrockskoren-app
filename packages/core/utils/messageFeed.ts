/** Shared helpers for Aktuellt / message feed merge and unread computation. */

export type MessageFeedItem = {
  messageId: string;
  groupSlug: string;
  title: string;
  body: string;
  createdAt: string;
  createdByUuid?: string;
  createdByName?: string;
  createdByGivenName?: string;
};

/** Hard cap per request (and unread window). */
export const MESSAGE_FEED_LIMIT = 50;

/** Default page size for list endpoints / “Ladda äldre”. */
export const MESSAGE_FEED_PAGE_SIZE = 20;

export function clampMessageFeedLimit(
  raw: number | undefined,
  fallback: number = MESSAGE_FEED_PAGE_SIZE
): number {
  if (raw === undefined || !Number.isFinite(raw)) return fallback;
  const n = Math.floor(raw);
  if (n < 1) return 1;
  if (n > MESSAGE_FEED_LIMIT) return MESSAGE_FEED_LIMIT;
  return n;
}

/** Cursor for paging older items: `{createdAt}#{messageId}`. */
export function messageFeedCursor(
  createdAt: string,
  messageId: string
): string {
  return `${createdAt}#${messageId}`;
}

export function parseMessageFeedCursor(
  raw: string | undefined | null
): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || !t.includes("#")) return null;
  return t;
}

/**
 * Merge choir-specific and ALL-scope messages, newest first, capped at limit.
 */
export function mergeMessageFeeds(
  choirMessages: MessageFeedItem[],
  allMessages: MessageFeedItem[],
  limit: number = MESSAGE_FEED_LIMIT
): MessageFeedItem[] {
  const byId = new Map<string, MessageFeedItem>();
  for (const msg of [...choirMessages, ...allMessages]) {
    if (!msg?.messageId) continue;
    byId.set(msg.messageId, msg);
  }
  return Array.from(byId.values())
    .sort((a, b) => {
      const cmp = (b.createdAt || "").localeCompare(a.createdAt || "");
      if (cmp !== 0) return cmp;
      return (b.messageId || "").localeCompare(a.messageId || "");
    })
    .slice(0, Math.max(0, limit));
}

/**
 * Compute unread count / hasUnread from message ids and a set of read message ids.
 */
export function computeUnread(
  messages: Array<{ messageId: string }>,
  readIds: Set<string> | Iterable<string>
): { hasUnread: boolean; unreadCount: number; unreadIds: string[] } {
  const readSet = readIds instanceof Set ? readIds : new Set(readIds);
  const unreadIds = messages
    .map((m) => m.messageId)
    .filter((id) => typeof id === "string" && id.length > 0 && !readSet.has(id));
  return {
    hasUnread: unreadIds.length > 0,
    unreadCount: unreadIds.length,
    unreadIds,
  };
}

export function scopeFromGroupSlug(groupSlug: string): "all" | "group" {
  return groupSlug === "ALL" ? "all" : "group";
}
