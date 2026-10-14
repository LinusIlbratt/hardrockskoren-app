import { describe, it, expect } from "vitest";
import { cancelSignupTransactItems } from "./cancelSignupWrite";

const NOW = new Date("2026-10-14T12:00:00.000Z");

describe("cancelSignupTransactItems", () => {
  it("deletes the ref, the signup row, and decrements signupCount", () => {
    const items = cancelSignupTransactItems({
      tableName: "HrkMainTable-dev",
      concertId: "gig-1",
      userUuid: "user-1",
      signupSk: "SIGNUP#2026-10-01T08:00:00.000Z#user-1",
      deleteRef: true,
      now: NOW,
    });

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      Delete: {
        Key: {
          PK: "SHARED_CONCERT#gig-1",
          SK: "SIGNUPREF#user-1",
        },
        ConditionExpression: "attribute_exists(SK)",
      },
    });
    expect(items[1]).toMatchObject({
      Delete: {
        Key: {
          PK: "SHARED_CONCERT#gig-1",
          SK: "SIGNUP#2026-10-01T08:00:00.000Z#user-1",
        },
        ConditionExpression: "attribute_exists(SK) AND userUuid = :uuid",
        ExpressionAttributeValues: { ":uuid": "user-1" },
      },
    });
    expect(items[2]).toMatchObject({
      Update: {
        Key: { PK: "SHARED_CONCERT#gig-1", SK: "META" },
        UpdateExpression: "ADD signupCount :minusOne",
        ExpressionAttributeValues: {
          ":one": 1,
          ":minusOne": -1,
          ":today": "2026-10-14",
          ":deleting": "deleting",
        },
      },
    });
  });

  it("skips the ref delete for a legacy signup row", () => {
    const items = cancelSignupTransactItems({
      tableName: "HrkMainTable-dev",
      concertId: "gig-1",
      userUuid: "user-1",
      signupSk: "SIGNUP#user-1",
      deleteRef: false,
      now: NOW,
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      Delete: {
        Key: { SK: "SIGNUP#user-1" },
      },
    });
    expect(items[1]).toMatchObject({
      Update: {
        UpdateExpression: "ADD signupCount :minusOne",
      },
    });
  });
});
