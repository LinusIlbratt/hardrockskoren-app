import { describe, expect, it } from "vitest";
import { evaluateMessageOwnership } from "./ownership";

describe("evaluateMessageOwnership", () => {
  it("allows admin regardless of author", () => {
    expect(evaluateMessageOwnership("admin", "admin-1", "someone-else")).toEqual({
      allowed: true,
    });
    expect(evaluateMessageOwnership("admin", undefined, "")).toEqual({
      allowed: true,
    });
  });

  it("allows a leader only when createdByUuid matches", () => {
    expect(evaluateMessageOwnership("leader", "leader-1", "leader-1")).toEqual({
      allowed: true,
    });
  });

  it("denies a leader editing or deleting someone else's message", () => {
    expect(evaluateMessageOwnership("leader", "leader-1", "admin-1")).toEqual({
      allowed: false,
      statusCode: 403,
    });
  });

  it("denies a leader when the message has no author", () => {
    expect(evaluateMessageOwnership("leader", "leader-1", "")).toEqual({
      allowed: false,
      statusCode: 403,
    });
  });

  it("returns 401 when a leader has no caller identity", () => {
    expect(evaluateMessageOwnership("leader", "  ", "leader-1")).toEqual({
      allowed: false,
      statusCode: 401,
    });
  });

  it("denies members", () => {
    expect(evaluateMessageOwnership("user", "user-1", "user-1")).toEqual({
      allowed: false,
      statusCode: 403,
    });
  });
});
