import { describe, it, expect } from "vitest";
import { routePermissions, RoleGroups } from "./permissions";

describe("message-api routePermissions", () => {
  it("registers all Aktuellt routes with expected roles", () => {
    expect(routePermissions["POST /messages"]).toEqual(RoleGroups.ADMIN_ONLY);
    expect(routePermissions["GET /messages/sent"]).toEqual(RoleGroups.ADMIN_ONLY);
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

describe("concert-api routePermissions", () => {
  it("registers shared concert routes with expected roles", () => {
    expect(routePermissions["POST /shared-concerts"]).toEqual(
      RoleGroups.ADMIN_ONLY
    );
    expect(routePermissions["PATCH /shared-concerts/{id}"]).toEqual(
      RoleGroups.ADMIN_ONLY
    );
    expect(routePermissions["DELETE /shared-concerts/{id}"]).toEqual(
      RoleGroups.ADMIN_ONLY
    );
    expect(routePermissions["GET /shared-concerts"]).toEqual(
      RoleGroups.ALL_LOGGED_IN
    );
    expect(routePermissions["POST /shared-concerts/{id}/signups"]).toEqual(
      RoleGroups.ALL_LOGGED_IN
    );
    expect(routePermissions["GET /shared-concerts/{id}/signups"]).toEqual(
      RoleGroups.ADMIN_ONLY
    );
  });
});
