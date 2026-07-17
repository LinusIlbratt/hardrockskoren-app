import type { MessageFeedItem } from "../../../core/utils/messageFeed";
import { MESSAGE_FEED_LIMIT } from "../../../core/utils/messageFeed";

export { MESSAGE_FEED_LIMIT };
export type { MessageFeedItem };

export const ALL_TARGET = "ALL";

/** Max choir targets per request (Message+Meta = 2 TransactWrite items each; DynamoDB cap 100). */
export const MAX_MESSAGE_TARGETS = 50;

export type MessageRecord = MessageFeedItem & {
  PK: string;
  SK: string;
  type: "Message";
  createdByUuid: string;
};

export type MessageMetaRecord = {
  PK: string;
  SK: string;
  type: "MessageMeta";
  messageId: string;
  groupSlug: string;
  targetPk: string;
  targetSk: string;
  title: string;
  body: string;
  createdAt: string;
  createdByUuid: string;
};

export type MessageReadRecord = {
  PK: string;
  SK: string;
  type: "MessageRead";
  messageId: string;
  readAt: string;
};

export function messagePk(groupSlug: string): string {
  return `GROUP#${groupSlug}`;
}

export function messageSk(createdAt: string, messageId: string): string {
  return `MSG#${createdAt}#${messageId}`;
}

export function messageMetaPk(messageId: string): string {
  return `MSG#${messageId}`;
}

export function messageReadSk(messageId: string): string {
  return `MSGREAD#${messageId}`;
}

export function normalizeTarget(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.toUpperCase() === ALL_TARGET) return ALL_TARGET;
  return t;
}

export type ResolvedCreateTargets =
  | { mode: "all" }
  | { mode: "groups"; groupSlugs: string[] };

export type ParseCreateTargetsResult =
  | { ok: true; value: ResolvedCreateTargets }
  | { ok: false; message: string };

/**
 * Resolves create-message destinations from request body.
 * Accepts either `targets: string[]` or legacy `target: string` (not both).
 * - ALL alone → single GROUP#ALL write (no fan-out)
 * - One or more choir slugs → fan-out writes (caller validates choirs exist)
 * - ALL mixed with choir slugs → error
 */
export function parseCreateTargets(
  body: Record<string, unknown>
): ParseCreateTargetsResult {
  const hasTarget = Object.prototype.hasOwnProperty.call(body, "target");
  const hasTargets = Object.prototype.hasOwnProperty.call(body, "targets");

  if (hasTarget && hasTargets) {
    return {
      ok: false,
      message: 'Provide either "targets" (array) or legacy "target" (string), not both.',
    };
  }

  if (!hasTarget && !hasTargets) {
    return {
      ok: false,
      message: 'targets is required (string array of choir slugs, or ["ALL"]).',
    };
  }

  let rawList: unknown[];

  if (hasTargets) {
    if (!Array.isArray(body.targets)) {
      return { ok: false, message: "targets must be a non-empty array of strings." };
    }
    rawList = body.targets;
  } else {
    // Legacy single target
    rawList = [body.target];
  }

  if (rawList.length === 0) {
    return { ok: false, message: "targets must contain at least one entry." };
  }

  if (rawList.length > MAX_MESSAGE_TARGETS) {
    return {
      ok: false,
      message: `targets may contain at most ${MAX_MESSAGE_TARGETS} entries.`,
    };
  }

  const normalized: string[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (typeof item !== "string") {
      return {
        ok: false,
        message: `targets[${i}] must be a string (choir slug or "ALL").`,
      };
    }
    const n = normalizeTarget(item);
    if (!n) {
      return {
        ok: false,
        message: `targets[${i}] must be a non-empty string (choir slug or "ALL").`,
      };
    }
    normalized.push(n);
  }

  const unique = Array.from(new Set(normalized));
  const hasAll = unique.includes(ALL_TARGET);
  const choirSlugs = unique.filter((s) => s !== ALL_TARGET);

  if (hasAll && choirSlugs.length > 0) {
    return {
      ok: false,
      message: 'Cannot combine "ALL" with specific choir slugs. Use either ALL or a list of choirs.',
    };
  }

  if (hasAll) {
    return { ok: true, value: { mode: "all" } };
  }

  if (choirSlugs.length === 0) {
    return { ok: false, message: "targets must contain at least one choir slug." };
  }

  return { ok: true, value: { mode: "groups", groupSlugs: choirSlugs } };
}
