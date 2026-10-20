import { describe, expect, it } from "vitest";
import {
  assertTokenUserPoolAllowed,
  getExpectedUserPoolId,
} from "./authHelper";

describe("getExpectedUserPoolId", () => {
  it("reads EXPECTED_USER_POOL_ID", () => {
    expect(
      getExpectedUserPoolId({
        EXPECTED_USER_POOL_ID: "eu-north-1_EXPECTED",
        COGNITO_USER_POOL_ID: "eu-north-1_OTHER",
        USER_POOL_ID: "eu-north-1_YET",
      })
    ).toBe("eu-north-1_EXPECTED");
  });

  it("does not fall back to COGNITO_USER_POOL_ID or USER_POOL_ID", () => {
    expect(
      getExpectedUserPoolId({
        COGNITO_USER_POOL_ID: "eu-north-1_COGNITO",
        USER_POOL_ID: "eu-north-1_USER",
      })
    ).toBeNull();
    expect(getExpectedUserPoolId({ USER_POOL_ID: "eu-north-1_USER" })).toBeNull();
  });

  it("returns null when unset or blank", () => {
    expect(getExpectedUserPoolId({})).toBeNull();
    expect(getExpectedUserPoolId({ EXPECTED_USER_POOL_ID: "  " })).toBeNull();
  });
});

describe("assertTokenUserPoolAllowed", () => {
  const env = { EXPECTED_USER_POOL_ID: "eu-north-1_I6wGK6WBR" };

  it("allows matching pool", () => {
    expect(() =>
      assertTokenUserPoolAllowed("eu-north-1_I6wGK6WBR", env)
    ).not.toThrow();
  });

  it("rejects other stage pool", () => {
    expect(() =>
      assertTokenUserPoolAllowed("eu-north-1_uBHh5NwyG", env)
    ).toThrow(/Token user pool mismatch/);
  });

  it("rejects when EXPECTED_USER_POOL_ID is missing even if other pool vars exist", () => {
    expect(() =>
      assertTokenUserPoolAllowed("eu-north-1_I6wGK6WBR", {
        COGNITO_USER_POOL_ID: "eu-north-1_I6wGK6WBR",
        USER_POOL_ID: "eu-north-1_I6wGK6WBR",
      })
    ).toThrow(/EXPECTED_USER_POOL_ID is not configured/);
  });
});
