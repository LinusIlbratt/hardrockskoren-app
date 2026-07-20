import { describe, it, expect } from "vitest";
import {
  LIST_GSI1_PK,
  LIST_GSI1_PK_LEGACY,
  LIST_GSI1_PK_PREFIX,
  CONCERT_DATE_TZ,
  MAX_TITLE_LENGTH,
  SHARED_CONCERT_LIST_DEFAULT_LIMIT,
  SHARED_CONCERT_LIST_MAX_LIMIT,
  SIGNUP_SK_PREFIX,
  SIGNUPREF_SK_PREFIX,
  sharedConcertPk,
  sharedConcertMetaSk,
  concertSignupSk,
  concertSignupRefSk,
  legacyConcertSignupSk,
  listGsi1Sk,
  listGsi1Pk,
  listGsi1PkForYear,
  yearFromGsi1Sk,
  todayInStockholm,
  isConcertOpenForSignup,
  isSharedConcertVisible,
  isValidConcertDate,
  encodeListCursor,
  decodeListCursor,
  decodeSignupListCursor,
  clampListLimit,
  normalizeBoundedString,
  META_OPEN_FOR_SIGNUP_CONDITION,
  metaOpenForSignupValues,
} from "./keys";

describe("shared concert keys", () => {
  it("builds PK/SK/GSI consistently", () => {
    expect(sharedConcertPk("abc123")).toBe("SHARED_CONCERT#abc123");
    expect(sharedConcertMetaSk()).toBe("META");
    expect(
      concertSignupSk("2026-07-20T09:15:00.000Z", "user-uuid")
    ).toBe("SIGNUP#2026-07-20T09:15:00.000Z#user-uuid");
    expect(concertSignupRefSk("user-uuid")).toBe("SIGNUPREF#user-uuid");
    expect(listGsi1Sk("2026-09-15", "abc123")).toBe("2026-09-15#abc123");
    expect(listGsi1Pk("2026-09-15")).toBe("SHARED_CONCERT#LIST#2026");
    expect(listGsi1PkForYear(2027)).toBe("SHARED_CONCERT#LIST#2027");
    expect(LIST_GSI1_PK).toBe(LIST_GSI1_PK_LEGACY);
    expect(LIST_GSI1_PK_PREFIX).toBe("SHARED_CONCERT#LIST#");
  });

  it("extracts year from GSI1SK for shard routing", () => {
    expect(yearFromGsi1Sk("2026-09-15#cid")).toBe(2026);
    expect(yearFromGsi1Sk("bad")).toBeNull();
  });

  it("documents legacy signup SK without createdAt/SIGNUPREF", () => {
    expect(legacyConcertSignupSk("user-uuid")).toBe("SIGNUP#user-uuid");
    expect(concertSignupRefSk("user-uuid").startsWith(SIGNUP_SK_PREFIX)).toBe(
      false
    );
  });

  it("sorts signup SK chronologically via ISO prefix", () => {
    const earlier = concertSignupSk("2026-07-20T09:00:00.000Z", "a");
    const later = concertSignupSk("2026-07-20T10:00:00.000Z", "b");
    expect(earlier < later).toBe(true);
  });

  it("does not use GROUP# or EVENT# prefixes", () => {
    const pk = sharedConcertPk("x");
    const sk = concertSignupSk("2026-07-20T09:00:00.000Z", "u");
    expect(pk.startsWith("GROUP#")).toBe(false);
    expect(sk.startsWith("EVENT#")).toBe(false);
    expect(pk).toMatch(/^SHARED_CONCERT#/);
    expect(sk.startsWith(SIGNUP_SK_PREFIX)).toBe(true);
    expect(concertSignupRefSk("u").startsWith(SIGNUPREF_SK_PREFIX)).toBe(true);
  });
});

describe("concert visibility and signup conditions", () => {
  it("treats deleting status as not visible", () => {
    expect(isSharedConcertVisible({ status: "active" })).toBe(true);
    expect(isSharedConcertVisible({})).toBe(true);
    expect(isSharedConcertVisible({ status: "deleting" })).toBe(false);
  });

  it("builds META open condition values with Stockholm today", () => {
    const now = new Date("2026-07-18T10:00:00.000Z");
    const values = metaOpenForSignupValues(now);
    expect(values[":today"]).toBe("2026-07-18");
    expect(values[":deleting"]).toBe("deleting");
    expect(META_OPEN_FOR_SIGNUP_CONDITION).toContain("concertDate >= :today");
    expect(META_OPEN_FOR_SIGNUP_CONDITION).toContain("#status <> :deleting");
  });
});

describe("concertDate (Europe/Stockholm)", () => {
  it("documents timezone constant", () => {
    expect(CONCERT_DATE_TZ).toBe("Europe/Stockholm");
  });

  it("formats today as YYYY-MM-DD in Stockholm", () => {
    const afternoonUtc = new Date("2026-07-18T20:30:00.000Z");
    expect(todayInStockholm(afternoonUtc)).toBe("2026-07-18");

    const lateUtc = new Date("2026-07-18T22:30:00.000Z");
    expect(todayInStockholm(lateUtc)).toBe("2026-07-19");
  });

  it("opens signup for today and future, closes for past", () => {
    const now = new Date("2026-07-18T10:00:00.000Z");
    expect(isConcertOpenForSignup("2026-07-18", now)).toBe(true);
    expect(isConcertOpenForSignup("2026-07-19", now)).toBe(true);
    expect(isConcertOpenForSignup("2026-07-17", now)).toBe(false);
  });

  it("validates ISO calendar dates", () => {
    expect(isValidConcertDate("2026-09-15")).toBe(true);
    expect(isValidConcertDate("2026-02-29")).toBe(false);
    expect(isValidConcertDate("2024-02-29")).toBe(true);
    expect(isValidConcertDate("2026-9-15")).toBe(false);
    expect(isValidConcertDate("not-a-date")).toBe(false);
    expect(isValidConcertDate(null)).toBe(false);
  });
});

describe("list cursor", () => {
  it("round-trips GSI1SK", () => {
    const sk = listGsi1Sk("2026-09-15", "cid");
    const cursor = encodeListCursor(sk);
    expect(decodeListCursor(cursor)).toBe(sk);
  });

  it("round-trips signup SK cursor", () => {
    const sk = concertSignupSk("2026-07-20T09:00:00.000Z", "u1");
    const cursor = encodeListCursor(sk);
    expect(decodeSignupListCursor(cursor)).toBe(sk);
  });

  it("rejects garbage cursors", () => {
    expect(decodeListCursor("")).toBeNull();
    expect(decodeListCursor("%%%")).toBeNull();
    expect(decodeListCursor(encodeListCursor("not-a-sk"))).toBeNull();
    expect(decodeListCursor(null)).toBeNull();
    expect(decodeSignupListCursor(encodeListCursor("SIGNUPREF#x"))).toBeNull();
  });
});

describe("clampListLimit", () => {
  it("defaults and caps", () => {
    expect(clampListLimit(undefined)).toBe(SHARED_CONCERT_LIST_DEFAULT_LIMIT);
    expect(clampListLimit("10")).toBe(10);
    expect(clampListLimit(100)).toBe(SHARED_CONCERT_LIST_MAX_LIMIT);
    expect(clampListLimit(0)).toBe(SHARED_CONCERT_LIST_DEFAULT_LIMIT);
  });
});

describe("normalizeBoundedString", () => {
  it("trims and enforces max", () => {
    expect(normalizeBoundedString("  Hej  ", 10)).toBe("Hej");
    expect(normalizeBoundedString("", 10)).toBeNull();
    expect(normalizeBoundedString("a".repeat(MAX_TITLE_LENGTH + 1), MAX_TITLE_LENGTH)).toBeNull();
    expect(normalizeBoundedString(42, 10)).toBeNull();
  });
});
