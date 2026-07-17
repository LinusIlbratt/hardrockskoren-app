/** Shared helpers for Aktuellt / message feed merge and unread computation. */

export type MessageFeedItem = {
  messageId: string;
  groupSlug: string;
  title: string;
  body: string;
  createdAt: string;
  createdByUuid?: string;
};

export const MESSAGE_FEED_LIMIT = 50;

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
