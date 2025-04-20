export type RoleTypes = "user" | "admin";

export interface AuthContext {
  uuid: string;
  role: RoleTypes;
  clientId: string;
  userPoolId: string;
}
