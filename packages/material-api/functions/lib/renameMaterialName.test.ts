import { describe, expect, it } from "vitest";
import {
  replacePathBasename,
  resolveRenameBasename,
} from "./renameMaterialName";

describe("resolveRenameBasename", () => {
  it("keeps an extension the user typed", () => {
    const result = resolveRenameBasename("Sopran.wav", "SOP-BASfilm.mp3", "Band/Song/SOP-BASfilm.mp3");
    expect(result).toEqual({ ok: true, basename: "Sopran.wav" });
  });

  it("appends the current extension when the new name has none", () => {
    const result = resolveRenameBasename("Sopran", "SOP-BASfilm.mp3", "Band/Song/SOP-BASfilm.mp3");
    expect(result).toEqual({ ok: true, basename: "Sopran.mp3" });
  });

  it("falls back to the filePath extension when title has none", () => {
    const result = resolveRenameBasename("Noter", "Noter", "Band/Song/score.PDF");
    expect(result).toEqual({ ok: true, basename: "Noter.PDF" });
  });

  it("rejects slashes and control characters", () => {
    expect(resolveRenameBasename("a/b.mp3", "old.mp3", "Folder/old.mp3").ok).toBe(false);
    expect(resolveRenameBasename("a\\b.mp3", "old.mp3", "Folder/old.mp3").ok).toBe(false);
    expect(resolveRenameBasename("bad\nname", "old.mp3", "Folder/old.mp3").ok).toBe(false);
    expect(resolveRenameBasename("   ", "old.mp3", "Folder/old.mp3").ok).toBe(false);
  });
});

describe("replacePathBasename", () => {
  it("replaces only the last path segment", () => {
    expect(replacePathBasename("Iron Maiden/The Trooper/SOP.mp3", "Sopran.mp3")).toBe(
      "Iron Maiden/The Trooper/Sopran.mp3"
    );
    expect(replacePathBasename("solo.mp3", "Sopran.mp3")).toBe("Sopran.mp3");
  });
});
