import { describe, expect, it } from "vitest";
import {
  buildRenamedFolderPath,
  folderRenameConflict,
  isCaseOnlyFolderRename,
  nextRepertoireTitle,
  parseFolderName,
  replaceFolderPrefix,
} from "./renameMaterialFolder";

describe("parseFolderName", () => {
  it("trims a plain folder name", () => {
    expect(parseFolderName("  Iron Maiden  ")).toEqual({ ok: true, name: "Iron Maiden" });
  });

  it("rejects slashes, traversal and key separators", () => {
    expect(parseFolderName("A/B").ok).toBe(false);
    expect(parseFolderName("A\\B").ok).toBe(false);
    expect(parseFolderName("..").ok).toBe(false);
    expect(parseFolderName("A#B").ok).toBe(false);
    expect(parseFolderName("   ")).toEqual({ ok: false, reason: "missing" });
  });
});

describe("buildRenamedFolderPath", () => {
  it("replaces the last segment and keeps parent folders", () => {
    expect(buildRenamedFolderPath("IRON MAIDEN", "Iron Maiden")).toBe("Iron Maiden");
    expect(buildRenamedFolderPath("Bed Of Roses", "Bed of Roses - Bon Jovi")).toBe(
      "Bed of Roses - Bon Jovi"
    );
    expect(buildRenamedFolderPath("Artist/Song", "New Song")).toBe("Artist/New Song");
  });

  it("rejects a path that would grow past the limit", () => {
    const parent = "a".repeat(180);
    expect(buildRenamedFolderPath(`${parent}/song`, "b".repeat(30))).toBeNull();
  });
});

describe("replaceFolderPrefix", () => {
  it("rewrites the folder and nested files without touching the file name", () => {
    expect(replaceFolderPrefix("Bed Of Roses/stamma.mp3", "Bed Of Roses", "Bed of Roses - Bon Jovi")).toBe(
      "Bed of Roses - Bon Jovi/stamma.mp3"
    );
    expect(
      replaceFolderPrefix("IRON MAIDEN/The Trooper/lead.mp3", "IRON MAIDEN", "Iron Maiden")
    ).toBe("Iron Maiden/The Trooper/lead.mp3");
  });

  it("does not rewrite a sibling folder that only shares a text prefix", () => {
    expect(replaceFolderPrefix("Bed Of Roses Live/a.mp3", "Bed Of Roses", "Other")).toBeNull();
  });
});

describe("isCaseOnlyFolderRename", () => {
  it("allows a spelling change of the same path and rejects a real rename", () => {
    expect(isCaseOnlyFolderRename("IRON MAIDEN", "Iron Maiden")).toBe(true);
    expect(isCaseOnlyFolderRename("IRON MAIDEN", "IRON MAIDEN")).toBe(false);
    expect(isCaseOnlyFolderRename("Bed Of Roses", "Bed of Roses - Bon Jovi")).toBe(false);
  });
});

describe("nextRepertoireTitle", () => {
  it("follows the library path and leaves a custom title", () => {
    expect(nextRepertoireTitle("IRON MAIDEN", "IRON MAIDEN", "Iron Maiden")).toBe("Iron Maiden");
    expect(nextRepertoireTitle("IRON MAIDEN/The Trooper", "IRON MAIDEN", "Iron Maiden")).toBe(
      "Iron Maiden/The Trooper"
    );
    expect(nextRepertoireTitle("Vårkonsert 2026", "IRON MAIDEN", "Iron Maiden")).toBeNull();
  });
});

describe("folderRenameConflict", () => {
  const oldPrefix = "IRON MAIDEN";
  const caseTarget = "Iron Maiden";

  it("allows a case change when the target spelling is empty", () => {
    expect(
      folderRenameConflict(
        [{ materialId: "a", filePath: "IRON MAIDEN/a.mp3" }],
        [],
        oldPrefix,
        caseTarget,
        false
      )
    ).toBe(false);
  });

  it("rejects a target folder that already has other files", () => {
    expect(
      folderRenameConflict(
        [{ materialId: "a", filePath: "Bed Of Roses/a.mp3" }],
        [{ materialId: "b", filePath: "Bed of Roses - Bon Jovi/b.mp3" }],
        "Bed Of Roses",
        "Bed of Roses - Bon Jovi",
        false
      )
    ).toBe(true);
  });

  it("rejects a different folder that already uses the target spelling", () => {
    expect(
      folderRenameConflict(
        [{ materialId: "a", filePath: "IRON MAIDEN/a.mp3" }],
        [{ materialId: "b", filePath: "Iron Maiden/b.mp3" }],
        oldPrefix,
        caseTarget,
        false
      )
    ).toBe(true);
  });

  it("treats files already moved in this rename as the same folder", () => {
    expect(
      folderRenameConflict(
        [{ materialId: "a", filePath: "Bed Of Roses/a.mp3" }],
        [{ materialId: "b", filePath: "Bed of Roses - Bon Jovi/b.mp3" }],
        "Bed Of Roses",
        "Bed of Roses - Bon Jovi",
        true
      )
    ).toBe(false);
  });
});
