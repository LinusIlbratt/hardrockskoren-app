/**
 * SharedConcert / ConcertSignup key helpers and typed records.
 * All list access via Query (GSI1 / PK prefix), never Scan.
 */

/**
 * Legacy unsharded GSI1 partition (pre year-shard). Still queried when listing
 * so existing rows remain visible until rewritten.
 */
export const LIST_GSI1_PK_LEGACY = "SHARED_CONCERT#LIST";

/** @deprecated Use listGsi1Pk(concertDate) — kept as alias of legacy partition. */
export const LIST_GSI1_PK = LIST_GSI1_PK_LEGACY;

export const LIST_GSI1_PK_PREFIX = "SHARED_CONCERT#LIST#";

/** Past years (relative to Stockholm current year) included when listing shards. */
export const LIST_SHARD_LOOKBACK_YEARS = 5;

/** Signup date comparisons use Europe/Stockholm calendar days. */
export const CONCERT_DATE_TZ = "Europe/Stockholm";

export const MAX_TITLE_LENGTH = 120;
export const MAX_LOCATION_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 4000;
export const MAX_FIRST_NAME_LENGTH = 80;
export const MAX_LAST_NAME_LENGTH = 80;
export const MAX_CHOIR_SLUG_LENGTH = 80;

/** List page size defaults (enforced in API). */
export const SHARED_CONCERT_LIST_DEFAULT_LIMIT = 20;
export const SHARED_CONCERT_LIST_MAX_LIMIT = 50;

/** Signup rows under a concert partition (chronological list + uniqueness refs). */
export const SIGNUP_SK_PREFIX = "SIGNUP#";
export const SIGNUPREF_SK_PREFIX = "SIGNUPREF#";
/** Upper bound for Query covering SIGNUP#* and SIGNUPREF#* under one PK. */
export const SIGNUP_CHILD_SK_END = "SIGNUPREF~";

export type ConcertSignupStatus = "active";
export type SharedConcertStatus = "active" | "deleting";

/** Canonical shared concert — one META item per concert. */
export type SharedConcertRecord = {
  PK: string;
  SK: "META";
  type: "SharedConcert";
  concertId: string;
  title: string;
  /** ISO calendar date YYYY-MM-DD (Europe/Stockholm semantics for open/closed). */
  concertDate: string;
  /** City / venue (stad/plats). */
  location: string;
  description?: string;
  createdAt: string;
  createdByUuid: string;
  signupCount: number;
  /**
   * Optimistic-lock counter for PATCH. Starts at 1 on create.
   * Legacy rows without the attribute are treated as version 1 by the API.
   */
  version?: number;
  /** Omit or "active" = normal; "deleting" = tombstone during cascade delete. */
  status?: SharedConcertStatus;
  /** Year-sharded list partition, e.g. SHARED_CONCERT#LIST#2026 */
  GSI1PK: string;
  GSI1SK: string;
};

/** Chronological signup row — SK embeds createdAt for Query sort order. */
export type ConcertSignupRecord = {
  PK: string;
  SK: string;
  type: "ConcertSignup";
  concertId: string;
  userUuid: string;
  firstName: string;
  lastName: string;
  choirSlug: string;
  choirName?: string;
  createdAt: string;
  status: ConcertSignupStatus;
};

/** One ref per userUuid — enforces duplicate signup without scanning. */
export type ConcertSignupRefRecord = {
  PK: string;
  SK: string;
  type: "ConcertSignupRef";
  concertId: string;
  userUuid: string;
  signupSk: string;
  createdAt: string;
};

export function sharedConcertPk(concertId: string): string {
  return `SHARED_CONCERT#${concertId}`;
}

export function sharedConcertMetaSk(): "META" {
  return "META";
}

/** Chronological signup SK — ISO8601 UTC sorts lexicographically by time. */
export function concertSignupSk(createdAtIso: string, userUuid: string): string {
  return `${SIGNUP_SK_PREFIX}${createdAtIso}#${userUuid}`;
}

/**
 * Pre-migration signup SK (`SIGNUP#${userUuid}`) — no createdAt segment.
 * Still listable via begins_with(SK, 'SIGNUP#'); may lack a SIGNUPREF row.
 */
export function legacyConcertSignupSk(userUuid: string): string {
  return `${SIGNUP_SK_PREFIX}${userUuid}`;
}

export function concertSignupRefSk(userUuid: string): string {
  return `${SIGNUPREF_SK_PREFIX}${userUuid}`;
}

export function listGsi1Sk(concertDate: string, concertId: string): string {
  return `${concertDate}#${concertId}`;
}

/**
 * Year-sharded GSI1PK from concertDate (YYYY-MM-DD) to spread write/read load.
 * Example: 2026-09-15 → SHARED_CONCERT#LIST#2026
 */
export function listGsi1Pk(concertDate: string): string {
  const year = concertDate.slice(0, 4);
  return `${LIST_GSI1_PK_PREFIX}${year}`;
}

export function listGsi1PkForYear(year: number): string {
  return `${LIST_GSI1_PK_PREFIX}${year}`;
}

/** Extract calendar year from GSI1SK (`YYYY-MM-DD#concertId`). */
export function yearFromGsi1Sk(gsi1Sk: string): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}#/.exec(gsi1Sk);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

/** YYYY-MM-DD for "today" in Europe/Stockholm. */
export function todayInStockholm(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CONCERT_DATE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isSharedConcertVisible(record: {
  status?: SharedConcertStatus | string;
}): boolean {
  return record.status !== "deleting";
}

/**
 * Signup allowed when concertDate >= today (Stockholm).
 * Past dates are listable (historik) but not open for signup.
 */
export function isConcertOpenForSignup(
  concertDate: string,
  now: Date = new Date()
): boolean {
  return concertDate >= todayInStockholm(now);
}

/**
 * Atomic ConditionExpression for META: exists, open date, not tombstoned.
 * Use with ExpressionAttributeValues including :today from todayInStockholm().
 */
export const META_OPEN_FOR_SIGNUP_CONDITION =
  "attribute_exists(PK) AND #type = :concertType AND concertDate >= :today AND (attribute_not_exists(#status) OR #status <> :deleting)";

export const META_OPEN_FOR_SIGNUP_NAMES = {
  "#type": "type",
  "#status": "status",
} as const;

export function metaOpenForSignupValues(now: Date = new Date()): {
  ":concertType": "SharedConcert";
  ":today": string;
  ":deleting": "deleting";
} {
  return {
    ":concertType": "SharedConcert",
    ":today": todayInStockholm(now),
    ":deleting": "deleting",
  };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidConcertDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** Cursor for GET /shared-concerts `before` — opaque base64url of GSI1SK. */
export function encodeListCursor(gsi1Sk: string): string {
  return Buffer.from(gsi1Sk, "utf8").toString("base64url");
}

export function decodeListCursor(cursor: unknown): string | null {
  if (typeof cursor !== "string" || !cursor.trim()) return null;
  try {
    const decoded = Buffer.from(cursor.trim(), "base64url").toString("utf8");
    if (!/^\d{4}-\d{2}-\d{2}#.+$/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Cursor for signup list — opaque base64url of signup SK. */
export function decodeSignupListCursor(cursor: unknown): string | null {
  if (typeof cursor !== "string" || !cursor.trim()) return null;
  try {
    const decoded = Buffer.from(cursor.trim(), "base64url").toString("utf8");
    if (!decoded.startsWith(SIGNUP_SK_PREFIX)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function clampListLimit(raw: unknown): number {
  const n =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : NaN;
  if (!Number.isFinite(n) || n < 1) return SHARED_CONCERT_LIST_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), SHARED_CONCERT_LIST_MAX_LIMIT);
}

export type FieldLimits = {
  title: typeof MAX_TITLE_LENGTH;
  location: typeof MAX_LOCATION_LENGTH;
  description: typeof MAX_DESCRIPTION_LENGTH;
  firstName: typeof MAX_FIRST_NAME_LENGTH;
  lastName: typeof MAX_LAST_NAME_LENGTH;
  choirSlug: typeof MAX_CHOIR_SLUG_LENGTH;
};

export const FIELD_LIMITS: FieldLimits = {
  title: MAX_TITLE_LENGTH,
  location: MAX_LOCATION_LENGTH,
  description: MAX_DESCRIPTION_LENGTH,
  firstName: MAX_FIRST_NAME_LENGTH,
  lastName: MAX_LAST_NAME_LENGTH,
  choirSlug: MAX_CHOIR_SLUG_LENGTH,
};

/** Trim + enforce max length; empty after trim → null. */
export function normalizeBoundedString(
  raw: unknown,
  maxLen: number
): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if (t.length > maxLen) return null;
  return t;
}
