/** Nollbreddstecken som inte är blanksteg men kan gömma sig i inklistrade namn. */
const INVISIBLE_FORMAT_CHARS = /[\u200B\u200C\u200D\u2060]/g;

const FIRST_LETTER = /\p{L}/u;

export interface MemberNameSource {
  given_name?: string | null;
  family_name?: string | null;
  email?: string | null;
}

export interface ParsedMemberName {
  givenName: string;
  familyName: string;
}

/** Byter unicode-blanksteg mot vanligt mellanslag, tar bort nollbreddstecken och slår ihop upprepade mellanslag. */
export function normalizeNamePart(value: string | null | undefined): string {
  return (value ?? "")
    .replace(INVISIBLE_FORMAT_CHARS, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Läser för- och efternamn från en medlem.
 * Saknas efternamn efter normalisering, och förnamnsfältet har minst två ord,
 * blir sista ordet efternamn och resten förnamn.
 */
export function parseMemberName(member: MemberNameSource): ParsedMemberName {
  let givenName = normalizeNamePart(member.given_name);
  let familyName = normalizeNamePart(member.family_name);

  if (!familyName) {
    const words = givenName.split(" ").filter((word) => word.length > 0);
    if (words.length >= 2) {
      familyName = words[words.length - 1] ?? "";
      givenName = words.slice(0, -1).join(" ");
    }
  }

  return { givenName, familyName };
}

/** "Söderlind, Maria" när båda delarna finns, annars den del som finns. */
export function formatMemberName(name: ParsedMemberName): string {
  if (name.familyName && name.givenName) {
    return `${name.familyName}, ${name.givenName}`;
  }
  return name.familyName || name.givenName;
}

function firstLetter(value: string): string {
  return value.match(FIRST_LETTER)?.[0] ?? "";
}

/** Första bokstaven i förnamn och efternamn. Blanksteg och skiljetecken hoppas över. */
export function memberNameInitials(name: ParsedMemberName): string {
  return `${firstLetter(name.givenName)}${firstLetter(name.familyName)}`;
}

function compareSwedish(a: string, b: string): number {
  return a.localeCompare(b, "sv", { sensitivity: "base" });
}

/** Tomt efternamn sorteras efter namn som har ett efternamn. */
function compareSurnameEmptyLast(a: string, b: string): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return compareSwedish(a, b);
}

/** Efternamn, sedan förnamn, sedan e-post. */
export function compareMembersBySurname(a: MemberNameSource, b: MemberNameSource): number {
  const nameA = parseMemberName(a);
  const nameB = parseMemberName(b);
  const byLast = compareSurnameEmptyLast(nameA.familyName, nameB.familyName);
  if (byLast !== 0) return byLast;
  const byFirst = compareSwedish(nameA.givenName, nameB.givenName);
  if (byFirst !== 0) return byFirst;
  return compareSwedish(a.email ?? "", b.email ?? "");
}
