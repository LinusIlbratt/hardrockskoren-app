import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { PageLoader } from "@/components/ui/loader/Loader";
import type { RoleTypes } from "@hrk/core/types";

type RequireRoleProps = {
  /** Allowed Cognito/app roles for this route tree. */
  roles: RoleTypes[];
  /**
   * Where to send unauthorized users.
   * Default: `/` (dashboard redirect picks member/leader home).
   */
  fallbackTo?: string;
};

/**
 * Defense-in-depth role guard for nested routes (Outlet).
 * Auth (logged-in) is assumed to be handled by ProtectedRoute above.
 */
export const RequireRole = ({ roles, fallbackTo = "/" }: RequireRoleProps) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!user || !roles.includes(user.role)) {
    return <Navigate to={fallbackTo} replace />;
  }

  return <Outlet />;
};
