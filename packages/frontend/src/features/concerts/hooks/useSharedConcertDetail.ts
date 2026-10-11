import { useMemo, useRef, useState } from "react";
import {
  getSharedConcert,
  listConcertSignups,
  VOICE_PARTS,
  type ConcertSignup,
  type SharedConcert,
} from "@/services/concertService";
import { extractSharedConcertError } from "@/features/concerts/hooks/sharedConcertError";
import type { PatchSharedConcert } from "@/features/concerts/hooks/useSharedConcertList";

const SIGNUPS_PAGE_SIZE = 50;

function formatVoicePartSummary(signups: ConcertSignup[]): string | null {
  if (signups.length === 0) return null;

  const counts = new Map<string, number>();
  let unset = 0;
  for (const signup of signups) {
    const part = signup.voicePart;
    if (part && (VOICE_PARTS as readonly string[]).includes(part)) {
      counts.set(part, (counts.get(part) ?? 0) + 1);
    } else {
      unset += 1;
    }
  }

  const parts = VOICE_PARTS.map((part) => `${part}: ${counts.get(part) ?? 0}`);
  if (unset > 0) {
    parts.push(`Övriga/Ej vald: ${unset}`);
  }
  return parts.join(" · ");
}

type UseSharedConcertDetailOptions = {
  resetEditor: () => void;
  patchConcert: PatchSharedConcert;
};

export function useSharedConcertDetail({
  resetEditor,
  patchConcert,
}: UseSharedConcertDetailOptions) {
  const resetRef = useRef(resetEditor);
  resetRef.current = resetEditor;
  const patchRef = useRef(patchConcert);
  patchRef.current = patchConcert;

  const [selected, setSelected] = useState<SharedConcert | null>(null);
  const [detailTab, setDetailTab] = useState<"signups" | "info">("signups");
  const [signups, setSignups] = useState<ConcertSignup[]>([]);
  const [signupCount, setSignupCount] = useState(0);
  const [signupsHasMore, setSignupsHasMore] = useState(false);
  const [signupsNextBefore, setSignupsNextBefore] = useState<string | null>(
    null
  );
  const [signupsError, setSignupsError] = useState<string | null>(null);
  const [isLoadingSignups, setIsLoadingSignups] = useState(false);
  const [isLoadingMoreSignups, setIsLoadingMoreSignups] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);

  const voicePartSummary = useMemo(
    () => formatVoicePartSummary(signups),
    [signups]
  );

  const closeDetail = () => {
    detailRequestRef.current += 1;
    setSelected(null);
    setDetailTab("signups");
    setIsLoadingDetail(false);
    setDetailError(null);
    resetRef.current();
  };

  const openDetail = async (concert: SharedConcert): Promise<SharedConcert | undefined> => {
    const requestId = ++detailRequestRef.current;
    const stillOpen = () => detailRequestRef.current === requestId;
    let freshConcert: SharedConcert | undefined;

    setSelected(concert);
    setDetailTab("signups");
    resetRef.current();
    setSignups([]);
    setSignupCount(concert.signupCount ?? 0);
    setSignupsHasMore(false);
    setSignupsNextBefore(null);
    setSignupsError(null);
    setDetailError(null);
    setIsLoadingSignups(true);
    setIsLoadingDetail(true);

    const signupsTask = listConcertSignups(concert.concertId, {
      limit: SIGNUPS_PAGE_SIZE,
    })
      .then((result) => {
        if (!stillOpen()) return;
        setSignups(result.signups);
        setSignupCount(result.signupCount);
        setSignupsHasMore(result.hasMore);
        setSignupsNextBefore(result.nextBefore);
        setSelected((prev) =>
          prev && prev.concertId === concert.concertId
            ? { ...prev, signupCount: result.signupCount }
            : prev
        );
        patchRef.current(concert.concertId, (c) => ({
          ...c,
          signupCount: result.signupCount,
        }));
      })
      .catch((error) => {
        if (!stillOpen()) return;
        console.error("Failed to list signups", error);
        setSignupsError(
          extractSharedConcertError(error, "Kunde inte hämta anmälningar.")
        );
      })
      .finally(() => {
        if (stillOpen()) setIsLoadingSignups(false);
      });

    const detailTask = getSharedConcert(concert.concertId)
      .then((fresh) => {
        if (!stillOpen()) return;
        freshConcert = fresh;
        setSelected((prev) => {
          if (!prev || prev.concertId !== concert.concertId) return prev;
          return {
            ...prev,
            ...fresh,
            description: fresh.description,
            signupCount: prev.signupCount,
          };
        });
        patchRef.current(fresh.concertId, (c) => ({
          ...c,
          ...fresh,
          description: fresh.description,
          signupCount: c.signupCount,
        }));
      })
      .catch((error) => {
        if (!stillOpen()) return;
        console.error("Failed to load concert detail", error);
        setDetailError(
          extractSharedConcertError(error, "Kunde inte hämta gigdetaljer.")
        );
      })
      .finally(() => {
        if (stillOpen()) setIsLoadingDetail(false);
      });

    await Promise.all([signupsTask, detailTask]);
    return stillOpen() ? freshConcert : undefined;
  };

  const loadMoreSignups = async () => {
    if (
      !selected ||
      isLoadingMoreSignups ||
      !signupsHasMore ||
      !signupsNextBefore
    ) {
      return;
    }
    setIsLoadingMoreSignups(true);
    try {
      const result = await listConcertSignups(selected.concertId, {
        limit: SIGNUPS_PAGE_SIZE,
        before: signupsNextBefore,
      });
      setSignups((prev) => {
        const seen = new Set(prev.map((s) => s.userUuid));
        const next = [...prev];
        for (const s of result.signups) {
          if (!seen.has(s.userUuid)) next.push(s);
        }
        return next;
      });
      setSignupCount(result.signupCount);
      setSignupsHasMore(result.hasMore);
      setSignupsNextBefore(result.nextBefore);
    } catch (error) {
      console.error("Failed to load more signups", error);
      setSignupsError("Kunde inte ladda fler anmälningar.");
    } finally {
      setIsLoadingMoreSignups(false);
    }
  };

  return {
    selected,
    setSelected,
    detailTab,
    setDetailTab,
    signups,
    signupCount,
    signupsHasMore,
    signupsError,
    isLoadingSignups,
    isLoadingMoreSignups,
    isLoadingDetail,
    detailError,
    voicePartSummary,
    openDetail,
    closeDetail,
    loadMoreSignups,
  };
}
