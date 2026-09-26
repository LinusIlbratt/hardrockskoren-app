import { describe, it, expect } from "vitest";
import {
  mergeMessageFeeds,
  computeUnread,
  scopeFromGroupSlug,
  clampMessageFeedLimit,
  parseMessageFeedCursor,
  messageFeedCursor,
  MESSAGE_FEED_LIMIT,
  MESSAGE_FEED_PAGE_SIZE,
  type MessageFeedItem,
} from "./messageFeed";

const msg = (
  id: string,
  createdAt: string,
  groupSlug = "stockholm"
): MessageFeedItem => ({
  messageId: id,
  groupSlug,
  title: `T${id}`,
  body: `B${id}`,
  createdAt,
});

describe("mergeMessageFeeds", () => {
  it("merges choir and ALL messages, newest first", () => {
    const choir = [
      msg("a", "2026-07-01T10:00:00.000Z"),
      msg("b", "2026-07-03T10:00:00.000Z"),
    ];
    const all = [msg("c", "2026-07-02T10:00:00.000Z", "ALL")];
    const merged = mergeMessageFeeds(choir, all);
    expect(merged.map((m) => m.messageId)).toEqual(["b", "c", "a"]);
  });

  it("dedupes by messageId", () => {
    const choir = [msg("a", "2026-07-01T10:00:00.000Z")];
    const all = [msg("a", "2026-07-01T10:00:00.000Z", "ALL")];
    expect(mergeMessageFeeds(choir, all)).toHaveLength(1);
  });

  it("respects limit", () => {
    const choir = Array.from({ length: 60 }, (_, i) =>
      msg(`id${i}`, `2026-07-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`)
    );
    const merged = mergeMessageFeeds(choir, [], 10);
    expect(merged).toHaveLength(10);
  });

  it("defaults to MESSAGE_FEED_LIMIT", () => {
    expect(MESSAGE_FEED_LIMIT).toBe(50);
    expect(MESSAGE_FEED_PAGE_SIZE).toBe(20);
  });
});

describe("clampMessageFeedLimit / cursors", () => {
  it("clamps to 1..MESSAGE_FEED_LIMIT", () => {
    expect(clampMessageFeedLimit(undefined)).toBe(MESSAGE_FEED_PAGE_SIZE);
    expect(clampMessageFeedLimit(0)).toBe(1);
    expect(clampMessageFeedLimit(999)).toBe(MESSAGE_FEED_LIMIT);
    expect(clampMessageFeedLimit(12)).toBe(12);
  });

  it("builds and parses feed cursors", () => {
    const c = messageFeedCursor("2026-07-18T10:00:00.000Z", "abc");
    expect(c).toBe("2026-07-18T10:00:00.000Z#abc");
    expect(parseMessageFeedCursor(c)).toBe(c);
    expect(parseMessageFeedCursor("nope")).toBeNull();
    expect(parseMessageFeedCursor("")).toBeNull();
  });
});

describe("computeUnread", () => {
  it("counts messages without read receipt", () => {
    const messages = [{ messageId: "1" }, { messageId: "2" }, { messageId: "3" }];
    const result = computeUnread(messages, new Set(["2"]));
    expect(result).toEqual({
      hasUnread: true,
      unreadCount: 2,
      unreadIds: ["1", "3"],
    });
  });

  it("returns hasUnread false when all read", () => {
    const messages = [{ messageId: "1" }];
    const result = computeUnread(messages, ["1"]);
    expect(result.hasUnread).toBe(false);
    expect(result.unreadCount).toBe(0);
  });
});

describe("scopeFromGroupSlug", () => {
  it("maps ALL to all scope", () => {
    expect(scopeFromGroupSlug("ALL")).toBe("all");
    expect(scopeFromGroupSlug("stockholm")).toBe("group");
  });
});
