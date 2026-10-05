import { describe, it, expect } from "vitest";
import {
  parseCreateConcertBody,
  parseUpdateConcertBody,
  parseSignupBody,
  parseJsonBody,
  parsePathId,
  toPublicConcert,
  toPublicSignup,
} from "./parse";
import {
  FIELD_LIMITS,
  isConcertOpenForSignup,
  listGsi1Pk,
  type ConcertSignupRecord,
  type SharedConcertRecord,
} from "./keys";

describe("parseCreateConcertBody", () => {
  it("accepts valid payload", () => {
    const result = parseCreateConcertBody({
      title: "Julkonsert",
      concertDate: "2026-12-13",
      location: "Stockholm",
      description: "Välkommen",
    });
    expect(result).toEqual({
      ok: true,
      title: "Julkonsert",
      concertDate: "2026-12-13",
      location: "Stockholm",
      description: "Välkommen",
    });
  });

  it("rejects missing title and bad date", () => {
    expect(parseCreateConcertBody({ concertDate: "2026-12-13", location: "X" }).ok).toBe(
      false
    );
    expect(
      parseCreateConcertBody({
        title: "A",
        concertDate: "13-12-2026",
        location: "X",
      }).ok
    ).toBe(false);
  });

  it("rejects overlong description", () => {
    const result = parseCreateConcertBody({
      title: "A",
      concertDate: "2026-12-13",
      location: "X",
      description: "x".repeat(FIELD_LIMITS.description + 1),
    });
    expect(result.ok).toBe(false);
  });
});

const baseRecord: SharedConcertRecord = {
  PK: "SHARED_CONCERT#id1",
  SK: "META",
  type: "SharedConcert",
  concertId: "id1",
  title: "Julkonsert",
  concertDate: "2026-12-13",
  location: "Stockholm",
  description: "Välkommen",
  createdAt: "2026-07-18T10:00:00.000Z",
  createdByUuid: "u1",
  signupCount: 0,
  version: 1,
  GSI1PK: listGsi1Pk("2026-12-13"),
  GSI1SK: "2026-12-13#id1",
};

describe("parseUpdateConcertBody", () => {
  it("accepts partial updates with actual changes", () => {
    expect(
      parseUpdateConcertBody({ title: "Ny titel", version: 1 }, baseRecord)
    ).toEqual({
      ok: true,
      updates: { title: "Ny titel" },
      expectedVersion: 1,
    });
    expect(
      parseUpdateConcertBody(
        { concertDate: "2026-12-20", version: 2 },
        baseRecord
      )
    ).toEqual({
      ok: true,
      updates: { concertDate: "2026-12-20" },
      expectedVersion: 2,
    });
  });

  it("allows clearing description with null", () => {
    expect(
      parseUpdateConcertBody({ description: null, version: 1 }, baseRecord)
    ).toEqual({
      ok: true,
      updates: { description: null },
      expectedVersion: 1,
    });
  });

  it("rejects empty body, unknown fields, missing version and no-op updates", () => {
    expect(parseUpdateConcertBody({}, baseRecord).ok).toBe(false);
    expect(parseUpdateConcertBody({ title: "X" }, baseRecord).ok).toBe(false);
    expect(
      parseUpdateConcertBody({ foo: "bar", version: 1 }, baseRecord).ok
    ).toBe(false);
    expect(
      parseUpdateConcertBody(
        { title: baseRecord.title, version: 1 },
        baseRecord
      ).ok
    ).toBe(false);
  });
});

describe("parseSignupBody", () => {
  it("accepts valid signup fields", () => {
    expect(
      parseSignupBody({
        firstName: "Anna",
        lastName: "Andersson",
        choirSlug: "stockholm",
        voicePart: "Sopran",
      })
    ).toEqual({
      ok: true,
      firstName: "Anna",
      lastName: "Andersson",
      choirSlug: "stockholm",
      voicePart: "Sopran",
    });
  });

  it("ignores userUuid in body (not parsed)", () => {
    const result = parseSignupBody({
      firstName: "Anna",
      lastName: "Andersson",
      choirSlug: "stockholm",
      voicePart: "Alt",
      userUuid: "attacker-uuid",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).not.toHaveProperty("userUuid");
    expect(result.voicePart).toBe("Alt");
  });

  it("rejects empty names", () => {
    expect(
      parseSignupBody({
        firstName: "  ",
        lastName: "X",
        choirSlug: "stockholm",
        voicePart: "Tenor",
      }).ok
    ).toBe(false);
  });

  it("rejects missing or unknown voicePart", () => {
    expect(
      parseSignupBody({
        firstName: "Anna",
        lastName: "Andersson",
        choirSlug: "stockholm",
      }).ok
    ).toBe(false);
    expect(
      parseSignupBody({
        firstName: "Anna",
        lastName: "Andersson",
        choirSlug: "stockholm",
        voicePart: "baryton",
      }).ok
    ).toBe(false);
  });
});

describe("toPublicSignup", () => {
  const baseSignup: ConcertSignupRecord = {
    PK: "SHARED_CONCERT#id1",
    SK: "SIGNUP#2026-10-05T00:00:00.000Z#user-1",
    type: "ConcertSignup",
    concertId: "id1",
    userUuid: "user-1",
    firstName: "Anna",
    lastName: "Andersson",
    choirSlug: "stockholm",
    voicePart: "Bas",
    createdAt: "2026-10-05T00:00:00.000Z",
    status: "active",
  };

  it("includes voicePart when present", () => {
    expect(toPublicSignup(baseSignup).voicePart).toBe("Bas");
  });

  it("omits voicePart on legacy rows that lack it", () => {
    const { voicePart: _voicePart, ...legacy } = baseSignup;
    const result = toPublicSignup(legacy as ConcertSignupRecord);
    expect(result).not.toHaveProperty("voicePart");
  });
});

describe("parseJsonBody / parsePathId", () => {
  it("parses JSON object", () => {
    expect(parseJsonBody('{"a":1}')).toEqual({ ok: true, body: { a: 1 } });
    expect(parseJsonBody("").ok).toBe(false);
    expect(parseJsonBody("[]").ok).toBe(false);
  });

  it("parses path id", () => {
    expect(parsePathId("abc")).toBe("abc");
    expect(parsePathId("  ")).toBeNull();
    expect(parsePathId(undefined)).toBeNull();
  });
});

describe("toPublicConcert", () => {
  it("maps record without internal keys", () => {
    const record: SharedConcertRecord = {
      PK: "SHARED_CONCERT#id1",
      SK: "META",
      type: "SharedConcert",
      concertId: "id1",
      title: "T",
      concertDate: "2026-12-01",
      location: "Gbg",
      createdAt: "2026-07-18T10:00:00.000Z",
      createdByUuid: "u1",
      signupCount: 3,
      version: 2,
      GSI1PK: listGsi1Pk("2026-12-01"),
      GSI1SK: "2026-12-01#id1",
    };
    const pub = toPublicConcert(
      record,
      isConcertOpenForSignup(record.concertDate, new Date("2026-07-18T10:00:00.000Z"))
    );
    expect(pub).toEqual({
      concertId: "id1",
      title: "T",
      concertDate: "2026-12-01",
      location: "Gbg",
      createdAt: "2026-07-18T10:00:00.000Z",
      signupCount: 3,
      signupOpen: true,
      version: 2,
    });
    expect(pub).not.toHaveProperty("PK");
    expect(pub).not.toHaveProperty("GSI1PK");
  });
});
