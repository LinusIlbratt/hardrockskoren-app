export const FOLDER_PATH_MAX = 200;

export type ItemKey = {
  PK: string;
  SK: string;
};

/** Same rules as library-folder links: trim slashes, reject traversal. */
export function normalizeFolderPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed || trimmed.length > FOLDER_PATH_MAX) return null;
  if (trimmed.includes("..") || trimmed.includes("\\")) return null;
  return trimmed;
}

export function libraryFolderPointerKey(folderPath: string, groupSlug: string): ItemKey {
  return {
    PK: `LIBRARYFOLDER#${folderPath}`,
    SK: `GROUP#${groupSlug}`,
  };
}

/** Directory prefixes of a file path, excluding the file name itself. */
export function directoryPrefixes(filePath: string): string[] {
  const parts = filePath.split("/").filter((part) => part.length > 0);
  if (parts.length < 2) return [];
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
}

/**
 * Folder paths whose LIBRARYFOLDER pointers must be removed when `root` is deleted.
 * Includes `root` and nested directories that appear in the collected file paths.
 */
export function folderPathsForLibraryDelete(root: string, filePaths: string[]): string[] {
  const nestedPrefix = `${root}/`;
  const paths = new Set<string>([root]);

  for (const filePath of filePaths) {
    if (filePath !== root && !filePath.startsWith(nestedPrefix)) continue;
    for (const dir of directoryPrefixes(filePath)) {
      if (dir === root || dir.startsWith(nestedPrefix)) {
        paths.add(dir);
      }
    }
  }

  return [...paths].sort((a, b) => a.localeCompare(b));
}

export function dedupeItemKeys(keys: ItemKey[]): ItemKey[] {
  const seen = new Set<string>();
  const out: ItemKey[] = [];
  for (const key of keys) {
    const id = `${key.PK}\0${key.SK}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(key);
  }
  return out;
}

export function isSafeToken(value: string, maxLength: number): boolean {
  return value.length > 0 && value.length <= maxLength && !value.includes("#") && !value.includes("/");
}
