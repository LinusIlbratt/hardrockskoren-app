import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { createAuthedClient } from "@/services/apiClient";
import { getAuthHeaders } from "@/utils/authHeaders";
import type { Group } from "@/types";
import type { SelectOption } from "@/components/ui/select/StyledSelect";
import { sortChoirsByName } from "@/utils/sortBySwedishTitle";

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

export function useMessageTargetGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);

  const fetchGroups = useCallback(async () => {
    setIsLoadingGroups(true);
    setGroupsError(null);

    if (!getAuthHeaders().Authorization) {
      setGroupsError("Du är inte inloggad.");
      setGroups([]);
      setIsLoadingGroups(false);
      return;
    }
    if (!ADMIN_API_URL?.trim()) {
      setGroupsError("Admin-API saknas (VITE_ADMIN_API_URL).");
      setGroups([]);
      setIsLoadingGroups(false);
      return;
    }

    try {
      const client = createAuthedClient(ADMIN_API_URL);
      const response = await client.get<Group[]>("/groups");
      const list = Array.isArray(response.data) ? response.data : [];
      const valid = list.filter(
        (g) => typeof g?.slug === "string" && g.slug.trim().length > 0
      );
      setGroups(sortChoirsByName(valid));
      if (valid.length === 0) {
        setGroupsError(
          "Inga körer hittades. Skapa en kör innan du skickar till valda."
        );
      }
    } catch (error) {
      console.error("Failed to fetch groups for message target", error);
      setGroups([]);
      setGroupsError(
        axios.isAxiosError(error) && !error.response
          ? "Kunde inte hämta körlistan (nätverksfel)."
          : "Kunde inte hämta körlistan."
      );
    } finally {
      setIsLoadingGroups(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const groupOptions: SelectOption[] = useMemo(
    () =>
      groups.map((g) => ({
        value: g.slug,
        label: g.name?.trim() ? g.name : g.slug,
      })),
    [groups]
  );

  const groupsBySlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      map.set(g.slug, g.name?.trim() ? g.name : g.slug);
    }
    return map;
  }, [groups]);

  return {
    groups,
    groupsError,
    isLoadingGroups,
    groupOptions,
    groupsBySlug,
  };
}
