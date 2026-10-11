import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listSharedConcerts,
  type SharedConcert,
} from "@/services/concertService";
import { extractSharedConcertError } from "@/features/concerts/hooks/sharedConcertError";

const LIST_PAGE_SIZE = 20;

export type SharedConcertTab = "create" | "list";

export type PatchSharedConcert = (
  concertId: string,
  update: (current: SharedConcert) => SharedConcert
) => void;

/** YYYY-MM-DD for "today" in Europe/Stockholm (same rule as signupOpen). */
function todayInStockholm(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function compareConcertDateAsc(a: SharedConcert, b: SharedConcert): number {
  const byDate = a.concertDate.localeCompare(b.concertDate);
  if (byDate !== 0) return byDate;
  return a.concertId.localeCompare(b.concertId);
}

function compareConcertDateDesc(a: SharedConcert, b: SharedConcert): number {
  return compareConcertDateAsc(b, a);
}

export function useSharedConcertList(activeTab: SharedConcertTab) {
  const [concerts, setConcerts] = useState<SharedConcert[]>([]);
  const [listHasMore, setListHasMore] = useState(false);
  const [listNextBefore, setListNextBefore] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchList = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const result = await listSharedConcerts({ limit: LIST_PAGE_SIZE });
      setConcerts(result.concerts);
      setListHasMore(result.hasMore);
      setListNextBefore(result.nextBefore);
    } catch (error) {
      console.error("Failed to list shared concerts", error);
      setConcerts([]);
      setListHasMore(false);
      setListNextBefore(null);
      setListError(
        extractSharedConcertError(error, "Kunde inte hämta gemensamma gig.")
      );
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  const loadMoreConcerts = async () => {
    if (isLoadingMore || !listHasMore || !listNextBefore) return;
    setIsLoadingMore(true);
    try {
      const result = await listSharedConcerts({
        limit: LIST_PAGE_SIZE,
        before: listNextBefore,
      });
      setConcerts((prev) => {
        const seen = new Set(prev.map((c) => c.concertId));
        const next = [...prev];
        for (const c of result.concerts) {
          if (!seen.has(c.concertId)) next.push(c);
        }
        return next;
      });
      setListHasMore(result.hasMore);
      setListNextBefore(result.nextBefore);
    } catch (error) {
      console.error("Failed to load more concerts", error);
      setListError("Kunde inte ladda fler gig.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const patchConcert = useCallback<PatchSharedConcert>((concertId, update) => {
    setConcerts((prev) =>
      prev.map((concert) =>
        concert.concertId === concertId ? update(concert) : concert
      )
    );
  }, []);

  useEffect(() => {
    // Fetch on mount and whenever the list tab is shown (not on create tab).
    if (activeTab === "list") {
      fetchList();
    }
  }, [activeTab, fetchList]);

  const { upcomingConcerts, pastConcerts } = useMemo(() => {
    const today = todayInStockholm();
    const upcoming: SharedConcert[] = [];
    const past: SharedConcert[] = [];
    for (const c of concerts) {
      if (c.concertDate >= today) {
        upcoming.push(c);
      } else {
        past.push(c);
      }
    }
    upcoming.sort(compareConcertDateAsc);
    past.sort(compareConcertDateDesc);
    return { upcomingConcerts: upcoming, pastConcerts: past };
  }, [concerts]);

  return {
    concerts,
    upcomingConcerts,
    pastConcerts,
    listHasMore,
    listError,
    isLoadingList,
    isLoadingMore,
    loadMoreConcerts,
    fetchList,
    patchConcert,
  };
}
