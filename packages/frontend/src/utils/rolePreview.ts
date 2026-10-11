export type ViewAsRole = 'leader' | 'user' | null;

const VIEW_AS_ROLE_KEY = 'hrk.viewAsRole';
const LAST_CHOIR_SLUG_KEY = 'lastActiveChoirSlug';

/** Fångar kör-sluggen även när sökvägen har en underflik, t.ex. /repertoires. */
const CHOIR_SLUG_PATTERN = /\/(admin\/groups|leader\/choir|user\/me)\/([^/]+)/;

export function readStoredViewAsRole(): ViewAsRole {
  try {
    const raw = sessionStorage.getItem(VIEW_AS_ROLE_KEY);
    if (raw === 'leader' || raw === 'user') return raw;
  } catch {
    // sessionStorage kan saknas i låsta webbläsare.
  }
  return null;
}

export function writeStoredViewAsRole(role: ViewAsRole): void {
  try {
    if (role === 'leader' || role === 'user') {
      sessionStorage.setItem(VIEW_AS_ROLE_KEY, role);
      return;
    }
    sessionStorage.removeItem(VIEW_AS_ROLE_KEY);
  } catch {
    // Ignorera om lagring är avstängd. Växlingen lever då bara i minnet.
  }
}

function decodeSlug(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.includes('/') || value.includes('\\') || value.includes('..')) return null;
  try {
    const decoded = decodeURIComponent(value).trim();
    if (!decoded || decoded.includes('/') || decoded.includes('..')) return null;
    return decoded;
  } catch {
    return value;
  }
}

/** Kör-slug från admin-, körledar- eller medlemsvy, oavsett underflik. */
export function choirSlugFromPath(pathname: string): string | null {
  const match = pathname.match(CHOIR_SLUG_PATTERN);
  if (!match?.[2]) return null;
  return decodeSlug(match[2]);
}

export function readLastActiveChoirSlug(): string | null {
  try {
    const raw = sessionStorage.getItem(LAST_CHOIR_SLUG_KEY);
    return raw ? decodeSlug(raw) : null;
  } catch {
    return null;
  }
}

export function writeLastActiveChoirSlug(slug: string | null): void {
  try {
    const safe = slug ? decodeSlug(slug) : null;
    if (safe) {
      sessionStorage.setItem(LAST_CHOIR_SLUG_KEY, safe);
      return;
    }
    sessionStorage.removeItem(LAST_CHOIR_SLUG_KEY);
  } catch {
    // Ignorera om lagring är avstängd.
  }
}

/** Aktuell URL först, annars senaste kör som besökts i den här fliken. */
export function resolveChoirSlug(pathname: string): string | null {
  return choirSlugFromPath(pathname) ?? readLastActiveChoirSlug();
}

function choirSegment(slug: string): string {
  return encodeURIComponent(slug);
}

/**
 * Mål-URL när en admin byter visningsläge.
 * Utan känd kör går medlem och körledare till körvalet.
 * Återgång landar på körens repertoar, samma ställe man lämnade.
 */
export function pathForViewAs(role: ViewAsRole, slug: string | null): string {
  if (role === 'user') {
    return slug ? `/user/me/${choirSegment(slug)}` : '/select-group';
  }
  if (role === 'leader') {
    return slug ? `/leader/choir/${choirSegment(slug)}` : '/select-group';
  }
  return slug ? `/admin/groups/${choirSegment(slug)}/repertoires` : '/admin/groups';
}
