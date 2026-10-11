/**
 * Tolkar filnamn/sökväg till stämma eller kategori + låtnamn,
 * och ger SATB-ordning för stämfiler.
 *
 * Bibliotekets `title` är filnamnet. En repertoarlänk kan spara
 * `voiceLabel` och `songTitle` som visas före den tolkade texten.
 */

export const VOICE_LABEL_PRESETS = [
  'Sopran',
  'Mezzosopran',
  'Alt',
  'Tenor',
  'Baryton',
  'Bas',
  'Kör/Tutti',
  'Rytmik',
  'Backtrack',
  'Övrigt',
] as const;

export type MaterialNameParts = {
  /** Stämma/kategori i Title Case, eller låtnamn när ingen stämma finns. */
  primary: string;
  /** Låtnamn/undertitel. Tom när den inte tillför något utöver primary. */
  secondary: string;
  /** 1–8 enligt SATB, 9 = övrigt. */
  sortRank: number;
  /** Sant när en känd stämma eller kategori hittades i namnet. */
  recognized: boolean;
};

export type MaterialLabelInput = {
  title?: string;
  filePath?: string;
  fileKey?: string;
  /** Låttitel från repertoaren, används som undertitel när filnamnet bara är en stämma. */
  songTitle?: string;
};

export type MemberMaterialSection = 'stems' | 'video' | 'scores' | 'other';

type Alias = {
  phrase: string;
  label: string;
  rank: number;
  /** Korta/tvetydiga ord matchas bara som eget segment, eller i versaler inuti ett namn. */
  segmentOnly: boolean;
};

const ALIASES: Alias[] = [
  { phrase: 'mezzo soprano', label: 'Mezzosopran', rank: 2, segmentOnly: false },
  { phrase: 'mezzosoprano', label: 'Mezzosopran', rank: 2, segmentOnly: false },
  { phrase: 'mezzosopran', label: 'Mezzosopran', rank: 2, segmentOnly: false },
  { phrase: 'backing track', label: 'Backtrack', rank: 8, segmentOnly: false },
  { phrase: 'backingtrack', label: 'Backtrack', rank: 8, segmentOnly: false },
  { phrase: 'hela koren', label: 'Hela kören', rank: 7, segmentOnly: false },
  { phrase: 'soprano', label: 'Sopran', rank: 1, segmentOnly: false },
  { phrase: 'sopran', label: 'Sopran', rank: 1, segmentOnly: false },
  { phrase: 'baritone', label: 'Baryton', rank: 5, segmentOnly: false },
  { phrase: 'baryton', label: 'Baryton', rank: 5, segmentOnly: false },
  { phrase: 'bariton', label: 'Baryton', rank: 5, segmentOnly: false },
  { phrase: 'backtrack', label: 'Backtrack', rank: 8, segmentOnly: false },
  { phrase: 'playback', label: 'Backtrack', rank: 8, segmentOnly: false },
  { phrase: 'instrumental', label: 'Backtrack', rank: 8, segmentOnly: false },
  { phrase: 'karaoke', label: 'Backtrack', rank: 8, segmentOnly: false },
  { phrase: 'textblad', label: 'Text', rank: 9, segmentOnly: false },
  { phrase: 'sangtext', label: 'Text', rank: 9, segmentOnly: false },
  { phrase: 'partitur', label: 'Noter', rank: 9, segmentOnly: false },
  { phrase: 'notfilm', label: 'Video', rank: 9, segmentOnly: false },
  { phrase: 'lyrics', label: 'Text', rank: 9, segmentOnly: false },
  { phrase: 'rytmik', label: 'Rytmik', rank: 8, segmentOnly: false },
  { phrase: 'rhythm', label: 'Rytmik', rank: 8, segmentOnly: false },
  { phrase: 'rythm', label: 'Rytmik', rank: 8, segmentOnly: false },
  { phrase: 'mezzo', label: 'Mezzosopran', rank: 2, segmentOnly: false },
  { phrase: 'tenor', label: 'Tenor', rank: 4, segmentOnly: false },
  { phrase: 'tutti', label: 'Tutti', rank: 7, segmentOnly: false },
  { phrase: 'noter', label: 'Noter', rank: 9, segmentOnly: false },
  { phrase: 'alto', label: 'Alt', rank: 3, segmentOnly: false },
  { phrase: 'bass', label: 'Bas', rank: 6, segmentOnly: false },
  { phrase: 'komp', label: 'Komp', rank: 8, segmentOnly: false },
  { phrase: 'choir', label: 'Kör', rank: 7, segmentOnly: true },
  { phrase: 'alla', label: 'Kör', rank: 7, segmentOnly: true },
  { phrase: 'sop', label: 'Sopran', rank: 1, segmentOnly: true },
  { phrase: 'alt', label: 'Alt', rank: 3, segmentOnly: true },
  { phrase: 'ten', label: 'Tenor', rank: 4, segmentOnly: true },
  { phrase: 'bas', label: 'Bas', rank: 6, segmentOnly: true },
  { phrase: 'kor', label: 'Kör', rank: 7, segmentOnly: true },
  { phrase: 'all', label: 'Kör', rank: 7, segmentOnly: true },
  { phrase: 'text', label: 'Text', rank: 9, segmentOnly: true },
  { phrase: 'video', label: 'Video', rank: 9, segmentOnly: true },
  { phrase: 'bt', label: 'Backtrack', rank: 8, segmentOnly: true },
];

const ALIASES_BY_LENGTH = [...ALIASES].sort((a, b) => b.phrase.length - a.phrase.length);

const FILE_EXT_RE = /\.(mp3|wav|m4a|ogg|aac|flac|pdf|txt|doc|docx|mp4|mov|webm|avi|mkv)$/i;
const GENERIC_NAME_RE =
  /^(audio|ljud|ljudfil|track|fil|file|inspelning|recording|mix|master|stem|stamma|dokument|document)(\s+\d+)?$/;

function stripExtension(name: string): string {
  return name.replace(FILE_EXT_RE, '');
}

function leafName(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.split(/[/\\]/).pop() ?? trimmed;
}

/** Gemener, utan diakriter, bindestreck/understreck som mellanslag. */
export function normalizeMaterialKey(raw: string): string {
  const lowered = stripExtension(raw).toLocaleLowerCase('sv');
  const stripped = lowered.normalize('NFD').replace(/\p{M}/gu, '');
  return stripped
    .replace(/[_–—-]+/g, ' ')
    .replace(/(\p{L})(\d+)/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isShouting(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return false;
  return letters === letters.toLocaleUpperCase('sv');
}

function toTitleCase(value: string): string {
  return value
    .toLocaleLowerCase('sv')
    .replace(/(^|[\s\-/])(\p{L})/gu, (_, separator: string, letter: string) =>
      separator + letter.toLocaleUpperCase('sv'),
    );
}

/** Tvätta HELVERSALER till Title Case. Blandad skiftläge lämnas orörd. */
export function washShoutedText(raw: string): string {
  const cleaned = stripExtension(raw).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const trimmed = cleaned.replace(/^[-–—\s]+|[-–—\s]+$/g, '').trim();
  if (!trimmed) return '';
  if (!isShouting(trimmed)) return trimmed;
  return toTitleCase(trimmed);
}

function sameText(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeMaterialKey(a) === normalizeMaterialKey(b);
}

function isGenericBasename(name: string): boolean {
  const key = normalizeMaterialKey(name);
  if (!key) return true;
  return GENERIC_NAME_RE.test(key);
}

function extensionOf(candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    const leaf = leafName(candidate);
    const match = leaf.match(/\.([a-z0-9]+)$/i);
    if (match) return match[1].toLowerCase();
  }
  return '';
}

type Hit = { label: string; rank: number; rest: string };

function matchEntire(segment: string): { label: string; rank: number } | null {
  const normalized = normalizeMaterialKey(segment);
  if (!normalized) return null;
  for (const alias of ALIASES_BY_LENGTH) {
    if (normalized === alias.phrase) {
      return { label: alias.label, rank: alias.rank };
    }
    const prefix = `${alias.phrase} `;
    if (normalized.startsWith(prefix)) {
      const rest = normalized.slice(prefix.length);
      if (/^\d+$/.test(rest)) {
        return { label: `${alias.label} ${rest}`, rank: alias.rank };
      }
    }
  }
  return null;
}

function peelAliasTokens(segment: string): Hit | null {
  const originalWords = segment.replace(/[_–—-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (originalWords.length < 2) return null;
  const normalizedWords = originalWords.map((word) => normalizeMaterialKey(word));

  let best: { alias: Alias; start: number; end: number; number?: string } | null = null;

  for (const alias of ALIASES_BY_LENGTH) {
    if (alias.phrase === 'all') continue;
    const phraseWords = alias.phrase.split(' ');
    for (let index = 0; index <= normalizedWords.length - phraseWords.length; index += 1) {
      let matches = true;
      for (let offset = 0; offset < phraseWords.length; offset += 1) {
        if (normalizedWords[index + offset] !== phraseWords[offset]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      let end = index + phraseWords.length;
      let number: string | undefined;
      if (end < normalizedWords.length && /^\d+$/.test(normalizedWords[end] ?? '')) {
        number = originalWords[end];
        end += 1;
      }

      const matchedOriginal = originalWords.slice(index, index + phraseWords.length).join(' ');
      if (alias.segmentOnly && !isShouting(matchedOriginal)) continue;

      const phraseLength = phraseWords.length;
      const bestLength = best ? best.alias.phrase.split(' ').length : 0;
      if (!best || phraseLength > bestLength) {
        best = { alias, start: index, end, number };
      }
    }
  }

  if (!best) return null;
  const match = best;
  const rest = originalWords
    .filter((_, index) => index < match.start || index >= match.end)
    .join(' ')
    .trim();
  const label = match.number ? `${match.alias.label} ${match.number}` : match.alias.label;
  return { label, rank: best.alias.rank, rest };
}

function splitLooseSegments(raw: string): string[] {
  const withoutExt = stripExtension(raw.trim()).replace(/_+/g, ' ');
  if (!withoutExt.trim()) return [];
  return withoutExt
    .split(/\s+[-–—]\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseRawName(raw: string): Hit | null {
  const segments = splitLooseSegments(raw);
  if (segments.length === 0) return null;

  if (segments.length >= 2) {
    for (let index = 0; index < segments.length; index += 1) {
      const hit = matchEntire(segments[index] ?? '');
      if (!hit) continue;
      const rest = segments.filter((_, segmentIndex) => segmentIndex !== index).join(' - ');
      return { ...hit, rest };
    }
  }

  const only = segments.length === 1 ? (segments[0] ?? '') : segments.join(' ');
  const entire = matchEntire(only);
  if (entire) return { ...entire, rest: '' };

  return peelAliasTokens(only);
}

function finishHit(hit: Hit, songTitle: string | undefined): MaterialNameParts {
  const washedRest = washShoutedText(hit.rest);
  const washedSong = songTitle ? washShoutedText(songTitle) : '';
  let secondary = washedRest;
  if (!secondary || sameText(secondary, hit.label) || isGenericBasename(secondary)) {
    secondary = washedSong && !sameText(washedSong, hit.label) ? washedSong : '';
  }
  if (sameText(secondary, hit.label)) secondary = '';
  return {
    primary: hit.label,
    secondary,
    sortRank: hit.rank,
    recognized: true,
  };
}

function fallbackLabel(
  fileRaw: string,
  ext: string,
  songTitle: string | undefined,
): MaterialNameParts {
  const washedFile = washShoutedText(stripExtension(leafName(fileRaw)));
  const washedSong = songTitle ? washShoutedText(songTitle) : '';
  const fileIsGeneric = isGenericBasename(washedFile);
  const meaningful = !fileIsGeneric && washedFile ? washedFile : washedSong;

  if (ext === 'mp4' || ext === 'mov' || ext === 'webm') {
    return categoryFallback('Video', meaningful, washedSong);
  }
  if (ext === 'txt') {
    return categoryFallback('Text', meaningful, washedSong);
  }
  if (ext === 'pdf' || ext === 'doc' || ext === 'docx') {
    return categoryFallback('Noter', meaningful, washedSong);
  }

  return {
    primary: meaningful || 'Okänd titel',
    secondary: '',
    sortRank: 9,
    recognized: false,
  };
}

function categoryFallback(label: string, meaningful: string, washedSong: string): MaterialNameParts {
  const fromName = meaningful && !sameText(meaningful, label) ? meaningful : '';
  const fromSong = washedSong && !sameText(washedSong, label) ? washedSong : '';
  return {
    primary: label,
    secondary: fromName || fromSong,
    sortRank: 9,
    recognized: true,
  };
}

const PRESET_RANK: Record<string, number> = {
  Sopran: 1,
  Mezzosopran: 2,
  Alt: 3,
  Tenor: 4,
  Baryton: 5,
  Bas: 6,
  'Kör/Tutti': 7,
  Rytmik: 8,
  Backtrack: 8,
  Övrigt: 9,
};

export type MaterialLabelOverrides = {
  title?: string;
  filePath?: string;
  fileKey?: string;
  voiceLabel?: string;
  songTitle?: string;
};

/** Sparad stämma/låttitel på repertoarlänken vinner över filnamnet. */
export function displayMaterialLabel(
  material: MaterialLabelOverrides,
  repertoireSongTitle?: string,
): MaterialNameParts {
  const parsed = parseMaterialLabel({
    title: material.title,
    filePath: material.filePath,
    fileKey: material.fileKey,
    songTitle: repertoireSongTitle,
  });
  const voice = material.voiceLabel?.trim() ?? '';
  const song = material.songTitle?.trim() ?? '';
  if (!voice && !song) return parsed;
  const sortRank = voice ? (PRESET_RANK[voice] ?? 9) : parsed.sortRank;
  return {
    primary: voice || parsed.primary,
    secondary: song || parsed.secondary,
    sortRank,
    recognized: voice ? sortRank <= 8 : parsed.recognized,
  };
}

export function parseMaterialLabel(input: MaterialLabelInput): MaterialNameParts {
  const songTitle = input.songTitle?.trim() || undefined;
  const fileRaw = leafName(input.title) || leafName(input.filePath) || leafName(input.fileKey);
  const ext = extensionOf([input.fileKey, input.filePath, input.title]);

  const fromFile = fileRaw ? parseRawName(fileRaw) : null;
  if (fromFile) return finishHit(fromFile, songTitle);

  if (input.filePath) {
    const segments = input.filePath.split('/').filter((part) => part.length > 0);
    segments.pop();
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const fromParent = parseRawName(segments[index] ?? '');
      if (!fromParent) continue;
      const fileRest = fileRaw ? washShoutedText(stripExtension(leafName(fileRaw))) : '';
      const rest =
        fromParent.rest ||
        (fileRest && !sameText(fileRest, fromParent.label) && !isGenericBasename(fileRest) ? fileRest : '');
      return finishHit({ ...fromParent, rest }, songTitle);
    }
  }

  return fallbackLabel(fileRaw, ext, songTitle);
}

export function compareMaterialLabels(a: MaterialNameParts, b: MaterialNameParts): number {
  if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
  const byPrimary = a.primary.localeCompare(b.primary, 'sv', { numeric: true, sensitivity: 'base' });
  if (byPrimary !== 0) return byPrimary;
  return a.secondary.localeCompare(b.secondary, 'sv', { numeric: true, sensitivity: 'base' });
}

export function materialLabelText(parts: MaterialNameParts): string {
  return parts.secondary ? `${parts.primary} — ${parts.secondary}` : parts.primary;
}

/** Medlemsvy: stämmor, video, noter, rytmik/övrigt. */
export function memberMaterialSection(
  fileKey: string | undefined,
  sortRank: number,
): MemberMaterialSection {
  const key = fileKey ?? '';
  if (/\.(mp4|mov|webm)$/i.test(key)) return 'video';
  if (/\.(pdf|txt|doc|docx)$/i.test(key)) return 'scores';
  if (/\.(mp3|wav|m4a|ogg)$/i.test(key)) {
    return sortRank === 8 ? 'other' : 'stems';
  }
  return 'other';
}
