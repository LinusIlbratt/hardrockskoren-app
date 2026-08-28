import { describe, expect, it } from "vitest";
import {
  applyResolvedSenderName,
  buildSenderName,
  hasStoredSenderName,
  namesFromAuthContext,
} from "./senderNames";

describe("buildSenderName", () => {
  it("returns given and full name when both exist", () => {
    expect(buildSenderName("Anna", "Andersson")).toEqual({
      createdByGivenName: "Anna",
      createdByName: "Anna Andersson",
    });
  });

  it("returns empty object when no names", () => {
    expect(buildSenderName("", "")).toEqual({});
    expect(buildSenderName(undefined, undefined)).toEqual({});
  });

  it("uses given name as full name when family name is missing", () => {
    expect(buildSenderName("Anna", "")).toEqual({
      createdByGivenName: "Anna",
      createdByName: "Anna",
    });
  });
});

describe("hasStoredSenderName", () => {
  it("detects stored given or full name", () => {
    expect(hasStoredSenderName({ createdByGivenName: "Anna" })).toBe(true);
    expect(hasStoredSenderName({ createdByName: "Anna Andersson" })).toBe(true);
    expect(hasStoredSenderName({})).toBe(false);
    expect(hasStoredSenderName({ createdByGivenName: "  " })).toBe(false);
  });
});

describe("applyResolvedSenderName", () => {
  it("fills missing names without overwriting existing values", () => {
    expect(
      applyResolvedSenderName(
        { createdByUuid: "u1" },
        { createdByGivenName: "Erik", createdByName: "Erik Svensson" }
      )
    ).toEqual({
      createdByUuid: "u1",
      createdByGivenName: "Erik",
      createdByName: "Erik Svensson",
    });

    expect(
      applyResolvedSenderName(
        { createdByGivenName: "Anna" },
        { createdByGivenName: "Erik", createdByName: "Erik Svensson" }
      )
    ).toEqual({ createdByGivenName: "Anna" });
  });
});

describe("namesFromAuthContext", () => {
  it("maps authorizer context to sender names", () => {
    expect(
      namesFromAuthContext({
        uuid: "u1",
        role: "admin",
        given_name: "Linus",
        family_name: "Ilbratt",
      })
    ).toEqual({
      createdByGivenName: "Linus",
      createdByName: "Linus Ilbratt",
    });
  });
});
