import { useState, type FormEvent } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

const CHOIR_PATH = /^\/(?:user\/me|leader\/choir|admin\/groups)\/([^/]+)/;

function groupSlugFromPath(pathname: string): string | undefined {
  const match = pathname.match(CHOIR_PATH);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

function isSafeGroupSlug(slug: string | undefined): slug is string {
  if (!slug) return false;
  const value = slug.trim();
  return value.length > 0 && !value.includes('/') && !value.includes('\\') && !value.includes('..');
}

function readServerMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || !('message' in data)) return undefined;
  const message = (data as { message: unknown }).message;
  if (typeof message !== 'string') return undefined;
  const trimmed = message.trim();
  return trimmed || undefined;
}

/**
 * Närvaroanmälan för den kör som är öppen i URL:en.
 * `groupSlug` vinner om den skickas in; annars läses :groupName eller sökvägen.
 */
export const useAttendance = (groupSlug?: string) => {
    const { getAuthHeaders } = useAuth();
    const params = useParams<{ groupName?: string }>();
    const { pathname } = useLocation();

    const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const activeGroupSlug = [groupSlug, params.groupName, groupSlugFromPath(pathname)]
        .map((slug) => slug?.trim())
        .find(isSafeGroupSlug);

    const openAttendanceModal = () => {
        setCode('');
        setError(null);
        setSuccessMessage(null);
        setIsAttendanceModalOpen(true);
    };

    const handleRegisterSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        if (!activeGroupSlug) {
            setError('Öppna en kör innan du anmäler närvaro.');
            setIsLoading(false);
            return;
        }

        const authHeaders = getAuthHeaders();
        if (!authHeaders.Authorization) {
            setError('Du är inte inloggad. Logga in igen.');
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch(
                `${API_BASE_URL}/groups/${encodeURIComponent(activeGroupSlug)}/attendance/register`,
                {
                    method: 'POST',
                    headers: {
                        ...authHeaders,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ attendanceCode: code }),
                }
            );

            const data: unknown = await response.json().catch(() => null);
            const serverMessage = readServerMessage(data);

            if (!response.ok) {
                throw new Error(serverMessage || 'Något gick fel.');
            }

            setSuccessMessage(serverMessage || 'Närvaro registrerad!');
        } catch (err: unknown) {
            const message = err instanceof Error && err.message.trim()
                ? err.message
                : 'Något gick fel.';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    };

    return {
        isAttendanceModalOpen,
        setIsAttendanceModalOpen,
        code,
        setCode,
        isLoading,
        error,
        successMessage,
        openAttendanceModal,
        handleRegisterSubmit,
    };
};
