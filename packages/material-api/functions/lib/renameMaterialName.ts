const MAX_BASENAME_LENGTH = 180;
const EXTENSION_RE = /\.[A-Za-z0-9]{1,8}$/;

export function leafName(value: string): string {
  const trimmed = value.trim();
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

export function extensionOfName(value: string | undefined): string {
  if (!value) return "";
  const match = leafName(value).match(EXTENSION_RE);
  return match ? match[0] : "";
}

export function replacePathBasename(filePath: string, newBasename: string): string {
  const i = filePath.lastIndexOf("/");
  if (i === -1) return newBasename;
  return filePath.slice(0, i + 1) + newBasename;
}

export type RenameNameResult =
  | { ok: true; basename: string }
  | { ok: false; message: string };

/**
 * Bygger det nya filnamnet. En angiven ändelse behålls.
 * Saknas ändelse läggs den befintliga på, från title och sedan filePath.
 */
export function resolveRenameBasename(
  requested: string,
  existingTitle: string | undefined,
  existingFilePath: string | undefined
): RenameNameResult {
  const trimmed = requested.trim();
  if (!trimmed) {
    return { ok: false, message: "Ange ett filnamn." };
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return { ok: false, message: "Filnamnet får inte innehålla snedstreck." };
  }
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return { ok: false, message: "Filnamnet innehåller ogiltiga tecken." };
  }
  if (trimmed === "." || trimmed === "..") {
    return { ok: false, message: "Ogiltigt filnamn." };
  }

  const hasExtension = EXTENSION_RE.test(trimmed);
  const existingExtension =
    extensionOfName(existingTitle) || extensionOfName(existingFilePath);
  const basename = hasExtension || !existingExtension ? trimmed : `${trimmed}${existingExtension}`;

  if (basename.length > MAX_BASENAME_LENGTH) {
    return { ok: false, message: `Filnamnet får vara högst ${MAX_BASENAME_LENGTH} tecken.` };
  }
  return { ok: true, basename };
}
