import type { MessageFeedItem } from "../../../core/utils/messageFeed";
import {
  MESSAGE_FEED_LIMIT,
  MESSAGE_FEED_PAGE_SIZE,
} from "../../../core/utils/messageFeed";

export { MESSAGE_FEED_LIMIT, MESSAGE_FEED_PAGE_SIZE };
export type { MessageFeedItem };

export const ALL_TARGET = "ALL";

/** GSI1 partition for admin sent-history (Query, newest first). */
export const SENT_GSI1_PK = "MSG#SENT";

/**
 * Max choir targets per request.
 * TransactWrite: 1 canonical + N MessageRefs ≤ 100 items.
 */
export const MAX_MESSAGE_TARGETS = 50;

export type MessageScope = "all" | "groups";

/** Canonical message body — one per send. */
export type MessageCanonicalRecord = {
  PK: string;
  SK: "META";
  type: "MessageCanonical";
  messageId: string;
  title: string;
  body: string;
  createdAt: string;
  createdByUuid: string;
  /** Full display name at send time. */
  createdByName?: string;
  /** Given name only — preferred for member UI. */
  createdByGivenName?: string;
  scope: MessageScope;
  /** ["ALL"] or choir slugs. */
  targets: string[];
  GSI1PK: typeof SENT_GSI1_PK;
  GSI1SK: string;
};

/** Thin visibility pointer under a choir (or GROUP#ALL). */
export type MessageRefRecord = {
  PK: string;
  SK: string;
  type: "MessageRef";
  messageId: string;
  groupSlug: string;
  createdAt: string;
};

/** @deprecated Legacy fan-out meta — still readable for mark/delete of old items. */
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

export function groupPk(groupSlug: string): string {
  return `GROUP#${groupSlug}`;
}

/** @deprecated Use groupPk */
export const messagePk = groupPk;

export function messageRefSk(createdAt: string, messageId: string): string {
  return `MSG#${createdAt}#${messageId}`;
}

/** @deprecated Use messageRefSk */
export const messageSk = messageRefSk;

export function messageCanonicalPk(messageId: string): string {
  return `MSG#${messageId}`;
}

/** @deprecated Use messageCanonicalPk */
export const messageMetaPk = messageCanonicalPk;

export function sentGsi1Sk(createdAt: string, messageId: string): string {
  return `${createdAt}#${messageId}`;
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
      message:
        'Cannot combine "ALL" with specific choir slugs. Use either ALL or a list of choirs.',
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

export function targetsFromResolved(
  resolved: ResolvedCreateTargets
): { scope: MessageScope; targets: string[] } {
  if (resolved.mode === "all") {
    return { scope: "all", targets: [ALL_TARGET] };
  }
  return { scope: "groups", targets: resolved.groupSlugs };
}
