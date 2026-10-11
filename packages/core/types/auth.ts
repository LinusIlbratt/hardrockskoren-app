export type RoleTypes = "user" | "admin" | "leader"; 

export interface AuthContext {
  uuid: string;
  role: RoleTypes;
  given_name?: string;
  family_name?: string;
  email?: string;
  groups?: string[];
  clientId?: string;
  userPoolId?: string;
}
