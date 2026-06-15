import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getMediaDownloadUrl } from '@/services/mediaUrlService';

/**
 * Resolves a presigned media URL for a single fileKey (cached in mediaUrlService).
 */
export function useMediaDownloadUrl(fileKey: string | undefined): {
  url: string | null;
  isLoading: boolean;
  error: string | null;
} {
  const { getAuthHeaders } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = fileKey?.trim();
    if (!key) {
      setUrl(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getMediaDownloadUrl(key, getAuthHeaders())
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) {
          setUrl(null);
          setError('Kunde inte ladda filen.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fileKey, getAuthHeaders]);

  return { url, isLoading, error };
}
