import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { PageLoader } from "@/components/ui/loader/Loader";
import type { RoleTypes } from "@hrk/core/types";
import { choirSlugFromPath, pathForViewAs } from "@/utils/rolePreview";

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
  const { user, isLoading, realRole, viewAsRole } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!user || !roles.includes(user.role)) {
    // Simulerad vy får inte studsa via `/`. Den sidan läser Cognito-grupper,
    // och en admin utan sångarplats hamnar då på "Inga körer hittades".
    if (realRole === 'admin' && viewAsRole) {
      const next = pathForViewAs(viewAsRole, choirSlugFromPath(location.pathname));
      if (location.pathname !== next && !location.pathname.startsWith(`${next}/`)) {
        return <Navigate to={next} replace />;
      }
    }
    return <Navigate to={fallbackTo} replace />;
  }

  return <Outlet />;
};
