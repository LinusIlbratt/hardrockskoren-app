import {
  FIELD_LIMITS,
  isValidConcertDate,
  normalizeBoundedString,
  type SharedConcertRecord,
  type ConcertSignupRecord,
} from "./keys";

export type ParseCreateConcertResult =
  | {
      ok: true;
      title: string;
      concertDate: string;
      location: string;
      description?: string;
    }
  | { ok: false; message: string };

const UPDATE_CONCERT_FIELDS = [
  "title",
  "concertDate",
  "location",
  "description",
] as const;

export type UpdateConcertFields = {
  title?: string;
  concertDate?: string;
  location?: string;
  /** `null` removes description; string sets/replaces it. */
  description?: string | null;
};

export type ParseUpdateConcertResult =
  | { ok: true; updates: UpdateConcertFields; expectedVersion: number }
  | { ok: false; message: string };

export type ParseSignupBodyResult =
  | {
      ok: true;
      firstName: string;
      lastName: string;
      choirSlug: string;
    }
  | { ok: false; message: string };

export function parseCreateConcertBody(
  body: Record<string, unknown>
): ParseCreateConcertResult {
  const title = normalizeBoundedString(body.title, FIELD_LIMITS.title);
  if (!title) {
    return {
      ok: false,
      message: `title is required (max ${FIELD_LIMITS.title} characters).`,
    };
  }

  if (!isValidConcertDate(body.concertDate)) {
    return {
      ok: false,
      message: "concertDate is required and must be YYYY-MM-DD.",
    };
  }

  const location = normalizeBoundedString(body.location, FIELD_LIMITS.location);
  if (!location) {
    return {
      ok: false,
      message: `location is required (max ${FIELD_LIMITS.location} characters).`,
    };
  }

  let description: string | undefined;
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      return { ok: false, message: "description must be a string." };
    }
    const trimmed = body.description.trim();
    if (trimmed.length > FIELD_LIMITS.description) {
      return {
        ok: false,
        message: `description must be at most ${FIELD_LIMITS.description} characters.`,
      };
    }
    if (trimmed) description = trimmed;
  }

  return {
    ok: true,
    title,
    concertDate: body.concertDate,
    location,
    ...(description ? { description } : {}),
  };
}

export function parseUpdateConcertBody(
  body: Record<string, unknown>,
  existing: SharedConcertRecord
): ParseUpdateConcertResult {
  const expectedVersion = parseExpectedVersion(body.version);
  if (expectedVersion === null) {
    return {
      ok: false,
      message: "version is required and must be a positive integer.",
    };
  }

  const keys = Object.keys(body).filter((k) => k !== "version");
  if (keys.length === 0) {
    return {
      ok: false,
      message: "Request body must include at least one field to update.",
    };
  }

  for (const key of keys) {
    if (
      !UPDATE_CONCERT_FIELDS.includes(
        key as (typeof UPDATE_CONCERT_FIELDS)[number]
      )
    ) {
      return { ok: false, message: `Unknown field: ${key}.` };
    }
  }

  const updates: UpdateConcertFields = {};

  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    const title = normalizeBoundedString(body.title, FIELD_LIMITS.title);
    if (!title) {
      return {
        ok: false,
        message: `title is required (max ${FIELD_LIMITS.title} characters).`,
      };
    }
    if (title !== existing.title) updates.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(body, "concertDate")) {
    if (!isValidConcertDate(body.concertDate)) {
      return {
        ok: false,
        message: "concertDate must be YYYY-MM-DD.",
      };
    }
    if (body.concertDate !== existing.concertDate) {
      updates.concertDate = body.concertDate;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "location")) {
    const location = normalizeBoundedString(body.location, FIELD_LIMITS.location);
    if (!location) {
      return {
        ok: false,
        message: `location is required (max ${FIELD_LIMITS.location} characters).`,
      };
    }
    if (location !== existing.location) updates.location = location;
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    if (body.description === null) {
      if (existing.description !== undefined) updates.description = null;
    } else if (typeof body.description !== "string") {
      return { ok: false, message: "description must be a string or null." };
    } else {
      const trimmed = body.description.trim();
      if (trimmed.length > FIELD_LIMITS.description) {
        return {
          ok: false,
          message: `description must be at most ${FIELD_LIMITS.description} characters.`,
        };
      }
      const next = trimmed || null;
      const current = existing.description ?? null;
      if (next !== current) updates.description = next;
    }
  }

  if (Object.keys(updates).length === 0) {
    return {
      ok: false,
      message: "No changes detected in request body.",
    };
  }

  return { ok: true, updates, expectedVersion };
}

function parseExpectedVersion(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) {
    return raw;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return null;
}

export function parseSignupBody(
  body: Record<string, unknown>
): ParseSignupBodyResult {
  const firstName = normalizeBoundedString(
    body.firstName,
    FIELD_LIMITS.firstName
  );
  if (!firstName) {
    return {
      ok: false,
      message: `firstName is required (max ${FIELD_LIMITS.firstName} characters).`,
    };
  }

  const lastName = normalizeBoundedString(body.lastName, FIELD_LIMITS.lastName);
  if (!lastName) {
    return {
      ok: false,
      message: `lastName is required (max ${FIELD_LIMITS.lastName} characters).`,
    };
  }

  const choirSlug = normalizeBoundedString(
    body.choirSlug,
    FIELD_LIMITS.choirSlug
  );
  if (!choirSlug) {
    return {
      ok: false,
      message: `choirSlug is required (max ${FIELD_LIMITS.choirSlug} characters).`,
    };
  }

  return { ok: true, firstName, lastName, choirSlug };
}

export type PublicSharedConcert = {
  concertId: string;
  title: string;
  concertDate: string;
  location: string;
  description?: string;
  createdAt: string;
  signupCount: number;
  signupOpen: boolean;
  /** Optimistic-lock version for PATCH (defaults to 1 if missing on legacy rows). */
  version: number;
  /** Set by list API when viewer identity is known (BatchGet enrichment). */
  viewerIsSignedUp?: boolean;
};

export function toPublicConcert(
  item: SharedConcertRecord,
  signupOpen: boolean
): PublicSharedConcert {
  return {
    concertId: item.concertId,
    title: item.title,
    concertDate: item.concertDate,
    location: item.location,
    ...(item.description ? { description: item.description } : {}),
    createdAt: item.createdAt,
    signupCount:
      typeof item.signupCount === "number" && Number.isFinite(item.signupCount)
        ? item.signupCount
        : 0,
    signupOpen,
    version:
      typeof item.version === "number" &&
      Number.isInteger(item.version) &&
      item.version >= 1
        ? item.version
        : 1,
  };
}

export type PublicConcertSignup = {
  userUuid: string;
  firstName: string;
  lastName: string;
  choirSlug: string;
  choirName?: string;
  createdAt: string;
  status: string;
};

export function toPublicSignup(item: ConcertSignupRecord): PublicConcertSignup {
  return {
    userUuid: item.userUuid,
    firstName: item.firstName,
    lastName: item.lastName,
    choirSlug: item.choirSlug,
    ...(item.choirName ? { choirName: item.choirName } : {}),
    createdAt: item.createdAt,
    status: item.status || "active",
  };
}

export function parseJsonBody(
  raw: string | undefined
):
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; message: string } {
  if (!raw?.trim()) {
    return { ok: false, message: "Request body is required." };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "Request body must be a JSON object." };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, message: "Invalid JSON body." };
  }
}

/** Normalize path id; empty → null. */
export function parsePathId(raw: string | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  try {
    const t = decodeURIComponent(raw).trim();
    return t.length > 0 ? t : null;
  } catch {
    const t = String(raw).trim();
    return t.length > 0 ? t : null;
  }
}
