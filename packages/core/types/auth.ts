export type RoleTypes = "user" | "admin" | "leader"; 

export interface AuthContext {
  uuid: string;
  role: RoleTypes;
  given_name: string;
  family_name: string;
  group: string;
  clientId?: string;
  userPoolId?: string;
}
