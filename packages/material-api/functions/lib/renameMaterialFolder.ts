import { FOLDER_PATH_MAX, normalizeFolderPath, type ItemKey } from "./libraryFolderKeys";

export type FolderNameResult =
  | { ok: true; name: string }
  | { ok: false; reason: "missing" | "invalid" | "too_long" };

export type FolderPathFile = {
  materialId: string;
  filePath: string;
};

/** A single path segment. Slashes, traversal and key separators are rejected. */
export function parseFolderName(raw: unknown): FolderNameResult {
  if (typeof raw !== "string") return { ok: false, reason: "missing" };
  const name = raw.trim();
  if (!name) return { ok: false, reason: "missing" };
  if (name.length > FOLDER_PATH_MAX) return { ok: false, reason: "too_long" };
  if (name.includes("/") || name.includes("\\") || name.includes("..") || name.includes("#")) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, name };
}

/** Replace the last segment of a folder path. The full path still has to pass normalizeFolderPath. */
export function buildRenamedFolderPath(folderPath: string, newName: string): string | null {
  const current = normalizeFolderPath(folderPath);
  const parsed = parseFolderName(newName);
  if (!current || parsed.ok === false) return null;
  const parts = current.split("/");
  parts[parts.length - 1] = parsed.name;
  return normalizeFolderPath(parts.join("/"));
}

export function replaceFolderPrefix(path: string, oldPrefix: string, newPrefix: string): string | null {
  if (path === oldPrefix) return newPrefix;
  const marker = `${oldPrefix}/`;
  if (!path.startsWith(marker)) return null;
  return `${newPrefix}${path.slice(oldPrefix.length)}`;
}

export function isCaseOnlyFolderRename(oldPath: string, newPath: string): boolean {
  return oldPath !== newPath && oldPath.toLowerCase() === newPath.toLowerCase();
}

/**
 * Repertoire titles that still are the library path follow the rename.
 * A custom title is left untouched.
 */
export function nextRepertoireTitle(title: string, oldPrefix: string, newPrefix: string): string | null {
  const current = title.trim();
  if (!current || current === newPrefix) return null;
  if (current === oldPrefix) return newPrefix;
  const marker = `${oldPrefix}/`;
  if (!current.startsWith(marker)) return null;
  const next = `${newPrefix}${current.slice(oldPrefix.length)}`;
  return next === current ? null : next;
}

/**
 * True when the target folder already holds a different file.
 * `continuing` means this rename already started, so files under the new
 * prefix belong to the same operation and are not a conflict.
 * A case-only change is not a conflict with itself; DynamoDB paths are
 * case-sensitive, so the source files are not returned for the new prefix.
 * A different folder that already uses the target spelling is still a conflict.
 */
export function folderRenameConflict(
  sourceFiles: FolderPathFile[],
  destinationFiles: FolderPathFile[],
  oldPrefix: string,
  newPrefix: string,
  continuing: boolean
): boolean {
  const sourceIds = new Set(sourceFiles.map((file) => file.materialId));
  if (!continuing) {
    for (const dest of destinationFiles) {
      if (!sourceIds.has(dest.materialId)) return true;
    }
  }

  const occupantByPath = new Map(destinationFiles.map((file) => [file.filePath, file.materialId]));
  for (const source of sourceFiles) {
    const next = replaceFolderPrefix(source.filePath, oldPrefix, newPrefix);
    if (!next) continue;
    const occupant = occupantByPath.get(next);
    if (occupant && occupant !== source.materialId) return true;
  }
  return false;
}

export function folderRenameLockKey(folderPath: string): ItemKey {
  return {
    PK: `FOLDERRENAME#${folderPath}`,
    SK: "LOCK",
  };
}
