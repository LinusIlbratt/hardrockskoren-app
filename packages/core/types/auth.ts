export type RoleTypes = "user" | "admin";

export interface AuthContext {
  uuid: string;
  role: RoleTypes;
  group: string;
  clientId: string;
  userPoolId: string;
}
