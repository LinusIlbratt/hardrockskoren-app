import { describe, expect, it } from "vitest";
import {
  dedupeItemKeys,
  directoryPrefixes,
  folderPathsForLibraryDelete,
  isSafeToken,
  libraryFolderPointerKey,
  normalizeFolderPath,
} from "./libraryFolderKeys";

describe("normalizeFolderPath", () => {
  it("trims slashes and rejects traversal", () => {
    expect(normalizeFolderPath(" /Iron Maiden/The Trooper/ ")).toBe(
      "Iron Maiden/The Trooper"
    );
    expect(normalizeFolderPath("../etc")).toBeNull();
    expect(normalizeFolderPath("")).toBeNull();
  });
});

describe("libraryFolderPointerKey", () => {
  it("builds the choir pointer for a normalized folder path", () => {
    expect(libraryFolderPointerKey("Iron Maiden/The Trooper", "malmo")).toEqual({
      PK: "LIBRARYFOLDER#Iron Maiden/The Trooper",
      SK: "GROUP#malmo",
    });
  });
});

describe("folderPathsForLibraryDelete", () => {
  it("includes the root and nested directories, and ignores other folders", () => {
    expect(
      folderPathsForLibraryDelete("Band", [
        "Band/a.mp3",
        "Band/Song/b.mp3",
        "Other/c.mp3",
      ])
    ).toEqual(["Band", "Band/Song"]);
  });

  it("does not include a parent folder when a nested song is deleted", () => {
    expect(folderPathsForLibraryDelete("Band/Song", ["Band/Song/b.mp3"])).toEqual([
      "Band/Song",
    ]);
  });

  it("still returns the root when the folder has no files", () => {
    expect(folderPathsForLibraryDelete("Band", [])).toEqual(["Band"]);
  });
});

describe("directoryPrefixes", () => {
  it("drops the file name", () => {
    expect(directoryPrefixes("Band/Song/stamma.mp3")).toEqual(["Band", "Band/Song"]);
  });
});

describe("dedupeItemKeys", () => {
  it("keeps the first copy of a key", () => {
    const key = { PK: "REPERTOIRE#a", SK: "MATERIAL#b" };
    expect(dedupeItemKeys([key, { ...key }, { PK: "GROUP#x", SK: "REPERTOIRE#a" }])).toEqual([
      key,
      { PK: "GROUP#x", SK: "REPERTOIRE#a" },
    ]);
  });
});

describe("isSafeToken", () => {
  it("rejects key separators", () => {
    expect(isSafeToken("abc", 80)).toBe(true);
    expect(isSafeToken("a#b", 80)).toBe(false);
    expect(isSafeToken("a/b", 80)).toBe(false);
    expect(isSafeToken("", 80)).toBe(false);
  });
});
