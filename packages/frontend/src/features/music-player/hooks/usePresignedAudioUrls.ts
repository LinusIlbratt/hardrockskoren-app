import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getMediaDownloadUrls } from '@/services/mediaUrlService';
import { isAbortError } from '@/utils/apiError';

/**
 * Hämtar presignerade uppspelning-URL:er via mediaUrlService.
 * Cache och TTL ägs av tjänsten. Pågående anrop avbryts när nycklarna byts eller komponenten avmonteras.
 */
export function usePresignedAudioUrls(fileKeys: readonly string[]): {
  urls: Record<string, string>;
  isLoading: boolean;
  error: string | null;
} {
  const { getAuthHeaders } = useAuth();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keySignature = [...new Set(fileKeys.map((key) => key.trim()).filter(Boolean))].join('\0');

  useEffect(() => {
    const keys = keySignature ? keySignature.split('\0') : [];
    if (keys.length === 0) {
      setUrls({});
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setIsLoading(true);
    setError(null);

    getMediaDownloadUrls(keys, getAuthHeaders(), controller.signal)
      .then((resolved) => {
        if (!active) return;
        setUrls(resolved);
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted || isAbortError(err)) return;
        setUrls({});
        setError('Kunde inte ladda ljudfilerna.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [keySignature, getAuthHeaders]);

  return { urls, isLoading, error };
}
