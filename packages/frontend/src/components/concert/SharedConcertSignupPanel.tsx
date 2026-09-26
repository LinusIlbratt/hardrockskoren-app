import { useState, useEffect, useCallback } from "react";
import { Button, ButtonSize, ButtonVariant } from "@/components/ui/button/Button";
import { listSharedConcerts, type SharedConcert } from "@/services/concertService";
import {
  extractApiErrorMessage,
  SharedConcertSignupModal,
} from "@/components/concert/SharedConcertSignupModal";
import styles from "./SharedConcertSignupPanel.module.scss";

const LIST_PAGE_SIZE = 20;

function formatConcertDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return isoDate;
  }
}

type SharedConcertSignupPanelProps = {
  /** Route choir slug — preselected when user belongs to that choir. */
  preferredChoirSlug?: string;
  /** Cognito group slugs the user belongs to. */
  userGroups: string[];
  givenName?: string;
  familyName?: string;
};

function patchConcertList(
  prev: SharedConcert[],
  fresh: SharedConcert
): SharedConcert[] {
  return prev.map((c) =>
    c.concertId === fresh.concertId ? { ...c, ...fresh } : c
  );
}

export const SharedConcertSignupPanel = ({
  preferredChoirSlug,
  userGroups,
  givenName = "",
  familyName = "",
}: SharedConcertSignupPanelProps) => {
  const [concerts, setConcerts] = useState<SharedConcert[]>([]);
  const [listHasMore, setListHasMore] = useState(false);
  const [listNextBefore, setListNextBefore] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selected, setSelected] = useState<SharedConcert | null>(null);

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
        extractApiErrorMessage(error, "Kunde inte hämta gemensamma gig.")
      );
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

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

  const handleConcertUpdated = (fresh: SharedConcert) => {
    setConcerts((prev) => patchConcertList(prev, fresh));
    setSelected((prev) =>
      prev?.concertId === fresh.concertId ? { ...prev, ...fresh } : prev
    );
  };

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Gemensamma gig för alla körer. Klicka på ett gig för att läsa
        mer och anmäla dig.
      </p>

      {isLoadingList && <p className={styles.muted}>Laddar gig…</p>}
      {!isLoadingList && listError && (
        <p className={styles.error}>{listError}</p>
      )}
      {!isLoadingList && !listError && concerts.length === 0 && (
        <p className={styles.muted}>Inga gemensamma gig just nu.</p>
      )}

      {!isLoadingList && concerts.length > 0 && (
        <ul className={styles.list}>
          {concerts.map((c) => (
            <li key={c.concertId}>
              <button
                type="button"
                className={styles.row}
                onClick={() => setSelected(c)}
              >
                <span className={styles.rowMain}>
                  <span className={styles.rowTitle}>{c.title}</span>
                  <span className={styles.rowMeta}>
                    {formatConcertDate(c.concertDate)}
                    {c.location ? ` · ${c.location}` : ""}
                  </span>
                </span>
                <span className={styles.rowBadge}>
                  {c.viewerIsSignedUp ? (
                    <span className={styles.signedUp}>Anmäld</span>
                  ) : !c.signupOpen ? (
                    <span className={styles.closed}>Stängd</span>
                  ) : (
                    "Öppen"
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {listHasMore && (
        <div className={styles.loadMore}>
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            size={ButtonSize.Small}
            disabled={isLoadingMore}
            onClick={loadMoreConcerts}
          >
            {isLoadingMore ? "Laddar…" : "Ladda fler"}
          </Button>
        </div>
      )}

      <SharedConcertSignupModal
        concert={selected}
        onClose={() => setSelected(null)}
        onConcertUpdated={handleConcertUpdated}
        preferredChoirSlug={preferredChoirSlug}
        userGroups={userGroups}
        givenName={givenName}
        familyName={familyName}
      />
    </div>
  );
};
