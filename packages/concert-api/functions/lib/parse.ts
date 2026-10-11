import {
  ALL_AUDIENCE_TARGET,
  FIELD_LIMITS,
  MAX_CHOIR_SLUG_LENGTH,
  MAX_SHARED_CONCERT_TARGETS,
  isValidConcertDate,
  isVoicePart,
  normalizeBoundedString,
  VOICE_PARTS,
  type ConcertAudienceScope,
  type SharedConcertRecord,
  type ConcertSignupRecord,
  type VoicePart,
} from "./keys";

export type ConcertAudience = {
  scope: ConcertAudienceScope;
  targets: string[];
};

export type ParseCreateConcertResult =
  | {
      ok: true;
      title: string;
      concertDate: string;
      location: string;
      description?: string;
      scope: ConcertAudienceScope;
      targets: string[];
    }
  | { ok: false; message: string };

const UPDATE_CONCERT_FIELDS = [
  "title",
  "concertDate",
  "location",
  "description",
  "scope",
  "targets",
] as const;

export type UpdateConcertFields = {
  title?: string;
  concertDate?: string;
  location?: string;
  /** `null` removes description; string sets/replaces it. */
  description?: string | null;
  scope?: ConcertAudienceScope;
  targets?: string[];
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
      voicePart: VoicePart;
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

  const audience = parseAudienceFields(body, { defaultAll: true });
  if (audience.ok === false) return audience;

  return {
    ok: true,
    title,
    concertDate: body.concertDate,
    location,
    ...(description ? { description } : {}),
    scope: audience.audience.scope,
    targets: audience.audience.targets,
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

  if (
    Object.prototype.hasOwnProperty.call(body, "scope") ||
    Object.prototype.hasOwnProperty.call(body, "targets")
  ) {
    const audience = parseAudienceFields(body, { defaultAll: false });
    if (audience.ok === false) return audience;
    const next = audience.audience;
    const currentScope = existing.scope;
    const currentTargets = existing.targets ?? [];
    const same =
      next.scope === currentScope &&
      next.targets.length === currentTargets.length &&
      next.targets.every((slug, index) => slug === currentTargets[index]);
    if (!same) {
      updates.scope = next.scope;
      updates.targets = next.targets;
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

const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function parseAudienceFields(
  body: Record<string, unknown>,
  options: { defaultAll: boolean }
): { ok: true; audience: ConcertAudience } | { ok: false; message: string } {
  const hasScope = Object.prototype.hasOwnProperty.call(body, "scope");
  const hasTargets = Object.prototype.hasOwnProperty.call(body, "targets");

  if (!hasScope && !hasTargets) {
    if (!options.defaultAll) {
      return { ok: false, message: "scope or targets is required." };
    }
    return { ok: true, audience: { scope: "all", targets: [ALL_AUDIENCE_TARGET] } };
  }

  let scope: ConcertAudienceScope | undefined;
  if (hasScope) {
    if (body.scope !== "all" && body.scope !== "groups") {
      return { ok: false, message: 'scope must be "all" or "groups".' };
    }
    scope = body.scope;
  }

  let targets: string[] | undefined;
  if (hasTargets) {
    if (!Array.isArray(body.targets)) {
      return { ok: false, message: "targets must be an array of choir slugs." };
    }
    if (body.targets.length === 0) {
      return { ok: false, message: "targets must contain at least one entry." };
    }
    if (body.targets.length > MAX_SHARED_CONCERT_TARGETS) {
      return {
        ok: false,
        message: `targets may contain at most ${MAX_SHARED_CONCERT_TARGETS} choirs.`,
      };
    }
    const normalized: string[] = [];
    for (let i = 0; i < body.targets.length; i += 1) {
      const raw = body.targets[i];
      if (typeof raw !== "string" || !raw.trim()) {
        return { ok: false, message: `targets[${i}] must be a non-empty string.` };
      }
      const slug = raw.trim();
      if (slug.toUpperCase() === ALL_AUDIENCE_TARGET) {
        normalized.push(ALL_AUDIENCE_TARGET);
        continue;
      }
      if (slug.length > MAX_CHOIR_SLUG_LENGTH || !SLUG_RE.test(slug)) {
        return {
          ok: false,
          message: `targets[${i}] must be a choir slug (letters, digits, _ or -).`,
        };
      }
      normalized.push(slug);
    }
    targets = Array.from(new Set(normalized));
  }

  const hasAll = targets?.includes(ALL_AUDIENCE_TARGET) ?? false;
  const choirSlugs = (targets ?? []).filter((slug) => slug !== ALL_AUDIENCE_TARGET);

  if (hasAll && choirSlugs.length > 0) {
    return {
      ok: false,
      message: 'Cannot combine "ALL" with specific choir slugs.',
    };
  }

  if (scope === "all" || (!scope && hasAll)) {
    if (hasTargets && choirSlugs.length > 0) {
      return {
        ok: false,
        message: 'scope "all" only allows targets ["ALL"].',
      };
    }
    return { ok: true, audience: { scope: "all", targets: [ALL_AUDIENCE_TARGET] } };
  }

  if (scope === "groups" || (!scope && choirSlugs.length > 0)) {
    if (choirSlugs.length === 0) {
      return {
        ok: false,
        message: 'scope "groups" requires at least one choir slug in targets.',
      };
    }
    return { ok: true, audience: { scope: "groups", targets: choirSlugs } };
  }

  return {
    ok: false,
    message: 'scope "groups" requires targets, or send targets ["ALL"] for every choir.',
  };
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

  if (!isVoicePart(body.voicePart)) {
    return {
      ok: false,
      message: `voicePart is required and must be one of: ${VOICE_PARTS.join(", ")}.`,
    };
  }

  return { ok: true, firstName, lastName, choirSlug, voicePart: body.voicePart };
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
  /** Absent on legacy concerts, which stay visible to every choir. */
  scope?: ConcertAudienceScope;
  targets?: string[];
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
    ...(item.scope === "all" || item.scope === "groups"
      ? {
          scope: item.scope,
          targets: Array.isArray(item.targets) ? item.targets.map(String) : [],
        }
      : {}),
  };
}

export type PublicConcertSignup = {
  userUuid: string;
  firstName: string;
  lastName: string;
  choirSlug: string;
  choirName?: string;
  /** Absent on signups created before voice part was collected. */
  voicePart?: VoicePart;
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
    ...(isVoicePart(item.voicePart) ? { voicePart: item.voicePart } : {}),
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
