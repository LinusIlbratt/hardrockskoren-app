import { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  choirSlugFromPath,
  pathForViewAs,
  writeLastActiveChoirSlug,
  type ViewAsRole,
} from '@/utils/rolePreview';

function isOnViewPath(pathname: string, role: ViewAsRole, slug: string | null): boolean {
  if (role === 'user') {
    if (!slug) return pathname === '/select-group';
    const base = `/user/me/${slug}`;
    return pathname === base || pathname.startsWith(`${base}/`);
  }
  if (role === 'leader') {
    if (!slug) return pathname === '/select-group';
    const base = `/leader/choir/${slug}`;
    return pathname === base || pathname.startsWith(`${base}/`);
  }
  if (!slug) return pathname === '/admin/groups';
  const base = `/admin/groups/${slug}/repertoires`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Byter adminens visningsläge och går till motsvarande körvy.
 * Token och backend-anrop lämnas orörda.
 */
export function useRolePreview() {
  const { realRole, viewAsRole, setViewAsRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const slug = choirSlugFromPath(location.pathname);
    if (slug) writeLastActiveChoirSlug(slug);
  }, [location.pathname]);

  const switchTo = (role: ViewAsRole) => {
    if (realRole !== 'admin') return;
    // Bara sluggen i den öppna adressen. En global sida (/admin/groups) har ingen
    // och ska till körvalet, inte till senast besökta kör.
    const slug = choirSlugFromPath(location.pathname);
    if (slug) writeLastActiveChoirSlug(slug);
    const next = pathForViewAs(role, slug);
    const alreadyThere = isOnViewPath(location.pathname, role, slug);

    if (role === null) {
      // Rollen måste vara admin innan admin-rutten ritas, annars studsar RequireRole.
      flushSync(() => setViewAsRole(null));
      if (!alreadyThere) navigate(next);
      return;
    }

    if (!alreadyThere) navigate(next);
    flushSync(() => setViewAsRole(role));
  };

  return {
    realRole,
    viewAsRole,
    switchTo,
    isPreview: viewAsRole !== null,
  };
}
