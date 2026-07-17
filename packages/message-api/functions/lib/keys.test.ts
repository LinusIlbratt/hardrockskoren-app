import { describe, it, expect } from "vitest";
import {
  mergeMessageFeeds,
  computeUnread,
  scopeFromGroupSlug,
} from "../../../core/utils/messageFeed";
import {
  normalizeTarget,
  ALL_TARGET,
  messageSk,
  messagePk,
  parseCreateTargets,
  MAX_MESSAGE_TARGETS,
} from "./keys";

describe("normalizeTarget", () => {
  it("accepts ALL case-insensitively", () => {
    expect(normalizeTarget("ALL")).toBe(ALL_TARGET);
    expect(normalizeTarget("all")).toBe(ALL_TARGET);
  });

  it("trims choir slugs", () => {
    expect(normalizeTarget("  stockholm  ")).toBe("stockholm");
  });

  it("rejects empty", () => {
    expect(normalizeTarget("")).toBeNull();
    expect(normalizeTarget(null)).toBeNull();
  });
});

describe("message keys", () => {
  it("builds PK/SK consistently", () => {
    expect(messagePk("stockholm")).toBe("GROUP#stockholm");
    expect(messagePk(ALL_TARGET)).toBe("GROUP#ALL");
    expect(messageSk("2026-07-16T10:00:00.000Z", "abc")).toBe(
      "MSG#2026-07-16T10:00:00.000Z#abc"
    );
  });
});

describe("parseCreateTargets", () => {
  it("resolves ALL from targets array", () => {
    const result = parseCreateTargets({ targets: ["ALL"] });
    expect(result).toEqual({ ok: true, value: { mode: "all" } });
  });

  it("resolves ALL from legacy target string", () => {
    const result = parseCreateTargets({ target: "all" });
    expect(result).toEqual({ ok: true, value: { mode: "all" } });
  });

  it("resolves and dedupes choir slugs", () => {
    const result = parseCreateTargets({
      targets: ["stockholm", " goteborg ", "stockholm"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      mode: "groups",
      groupSlugs: ["stockholm", "goteborg"],
    });
  });

  it("rejects ALL mixed with choir slugs", () => {
    const result = parseCreateTargets({
      targets: ["ALL", "stockholm"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/Cannot combine/i);
  });

  it("rejects both target and targets", () => {
    const result = parseCreateTargets({
      target: "stockholm",
      targets: ["goteborg"],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects empty targets", () => {
    expect(parseCreateTargets({ targets: [] }).ok).toBe(false);
    expect(parseCreateTargets({}).ok).toBe(false);
  });

  it("rejects non-string entries", () => {
    const result = parseCreateTargets({ targets: ["ok", 1 as unknown as string] });
    expect(result.ok).toBe(false);
  });

  it("rejects more than MAX_MESSAGE_TARGETS", () => {
    const targets = Array.from({ length: MAX_MESSAGE_TARGETS + 1 }, (_, i) => `g${i}`);
    const result = parseCreateTargets({ targets });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(String(MAX_MESSAGE_TARGETS));
  });
});

describe("feed helpers (IDOR-relevant unread)", () => {
  it("marks only unread ids", () => {
    const feed = mergeMessageFeeds(
      [
        {
          messageId: "choir-1",
          groupSlug: "stockholm",
          title: "A",
          body: "a",
          createdAt: "2026-07-16T12:00:00.000Z",
        },
      ],
      [
        {
          messageId: "all-1",
          groupSlug: "ALL",
          title: "B",
          body: "b",
          createdAt: "2026-07-16T13:00:00.000Z",
        },
      ]
    );
    expect(feed[0].messageId).toBe("all-1");
    expect(scopeFromGroupSlug(feed[0].groupSlug)).toBe("all");

    const unread = computeUnread(feed, new Set(["all-1"]));
    expect(unread.unreadIds).toEqual(["choir-1"]);
    expect(unread.hasUnread).toBe(true);
  });
});
