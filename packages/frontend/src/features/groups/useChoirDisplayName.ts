import { useEffect, useState } from "react";
import axios from "axios";
import type { Group } from "@/types";
import { getAuthHeaders } from "@/utils/authHeaders";

/**
 * Visningsnamn för en kör.
 * Sluggen är bara nyckeln: GET /groups/{slug} → GetItem PK GROUP#{slug} SK METADATA.
 * Namnet tas från Group.name (eller displayName om fältet finns). Sluggen visas aldrig.
 */
type GroupNameRecord = Group & { displayName?: string };

const nameBySlug = new Map<string, string>();

function readDisplayName(group: GroupNameRecord): string | null {
  const displayName = group.displayName?.trim();
  if (displayName) return displayName;
  const name = group.name?.trim();
  return name || null;
}

function lookupKey(slug: string): string {
  try {
    return decodeURIComponent(slug).trim();
  } catch {
    return slug.trim();
  }
}

export function useChoirDisplayName(slug: string | undefined): {
  name: string | null;
  isLoading: boolean;
} {
  const key = slug ? lookupKey(slug) : "";
  const cached = key ? nameBySlug.get(key) : undefined;
  const [name, setName] = useState<string | null>(cached ?? null);
  const [isLoading, setIsLoading] = useState(Boolean(key) && !cached);

  useEffect(() => {
    if (!key) {
      setName(null);
      setIsLoading(false);
      return;
    }

    const hit = nameBySlug.get(key);
    if (hit) {
      setName(hit);
      setIsLoading(false);
      return;
    }

    const headers = getAuthHeaders();
    if (!headers.Authorization) {
      setName(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setName(null);
    setIsLoading(true);

    const load = async () => {
      try {
        const response = await axios.get<GroupNameRecord>(
          `${import.meta.env.VITE_ADMIN_API_URL}/groups/${encodeURIComponent(key)}`,
          { headers },
        );
        const displayName = readDisplayName(response.data ?? { name: "", slug: key });
        if (cancelled) return;
        if (displayName) {
          nameBySlug.set(key, displayName);
          setName(displayName);
        } else {
          setName(null);
        }
      } catch (error) {
        console.error("Failed to fetch choir display name:", error);
        if (!cancelled) setName(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return { name, isLoading };
}
