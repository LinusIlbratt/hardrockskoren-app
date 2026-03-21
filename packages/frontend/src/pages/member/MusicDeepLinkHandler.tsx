import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useMusicPlayerOverlay,
  type MusicPlayerViewer,
} from '@/context/MusicPlayerOverlayContext';

interface MusicDeepLinkHandlerProps {
  viewer: MusicPlayerViewer;
}

/**
 * Öppnar musik-overlay och ersätter URL med repertoar (samma kör).
 * Används för bokmärken/delade länkar till …/music.
 */
export function MusicDeepLinkHandler({ viewer }: MusicDeepLinkHandlerProps) {
  const { groupName } = useParams<{ groupName: string }>();
  const navigate = useNavigate();
  const { open } = useMusicPlayerOverlay();

  useEffect(() => {
    if (!groupName?.trim()) {
      navigate('/', { replace: true });
      return;
    }
    const g = groupName.trim();
    open(g, viewer);
    const dest =
      viewer === 'leader'
        ? `/leader/choir/${g}/repertoires`
        : `/user/me/${g}/repertoires`;
    navigate(dest, { replace: true });
  }, [groupName, viewer, navigate, open]);

  return null;
}
