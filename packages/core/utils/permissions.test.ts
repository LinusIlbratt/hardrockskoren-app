import { describe, it, expect } from "vitest";
import { routePermissions, RoleGroups } from "./permissions";

describe("message-api routePermissions", () => {
  it("registers all Aktuellt routes with expected roles", () => {
    expect(routePermissions["POST /messages"]).toEqual(RoleGroups.ADMIN_ONLY);
    expect(routePermissions["GET /groups/{groupSlug}/messages"]).toEqual(
      RoleGroups.ALL_LOGGED_IN
    );
    expect(
      routePermissions["GET /groups/{groupSlug}/messages/unread-status"]
    ).toEqual(RoleGroups.ALL_LOGGED_IN);
    expect(routePermissions["POST /messages/{messageId}/read"]).toEqual(
      RoleGroups.ALL_LOGGED_IN
    );
    expect(routePermissions["DELETE /messages/{messageId}"]).toEqual(
      RoleGroups.ADMIN_ONLY
    );
  });
});
