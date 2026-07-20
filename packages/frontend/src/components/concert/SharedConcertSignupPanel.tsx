import { useState, useEffect, useCallback, useMemo, type FormEvent } from "react";
import axios from "axios";
import {
  Button,
  ButtonSize,
  ButtonVariant,
} from "@/components/ui/button/Button";
import { FormGroup } from "@/components/ui/form/FormGroup";
import { Input } from "@/components/ui/input/Input";
import { Modal } from "@/components/ui/modal/Modal";
import {
  StyledSelect,
  type SelectOption,
} from "@/components/ui/select/StyledSelect";
import {
  createConcertSignup,
  getSharedConcert,
  listSharedConcerts,
  type SharedConcert,
} from "@/services/concertService";
import styles from "./SharedConcertSignupPanel.module.scss";

const LIST_PAGE_SIZE = 20;

type SharedConcertSignupPanelProps = {
  /** Route choir slug — preselected when user belongs to that choir. */
  preferredChoirSlug?: string;
  /** Cognito group slugs the user belongs to. */
  userGroups: string[];
  givenName?: string;
  familyName?: string;
};

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

function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (data && typeof data === "object" && "message" in data) {
      const msg = (data as { message: unknown }).message;
      if (typeof msg === "string" && msg.trim()) {
        return msg.trim();
      }
    }
    if (error.response?.status === 401 || error.response?.status === 403) {
      return "Du har inte behörighet.";
    }
    if (!error.response) {
      return "Kunde inte nå konsert-API:t. Kontrollera nätverk och VITE_CONCERT_API_URL.";
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

/** 409 "already signed up" after a lost 201 (timeout) — treat as success in UI. */
function isDuplicateSignupConflict(error: unknown): boolean {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return false;
  const msg = extractApiErrorMessage(error, "").toLowerCase();
  return msg.includes("redan anmäld") || msg.includes("already");
}

function applySignedUpLocalState(
  concert: SharedConcert
): SharedConcert {
  return {
    ...concert,
    viewerIsSignedUp: true,
    signupCount: concert.viewerIsSignedUp
      ? concert.signupCount ?? 0
      : (concert.signupCount ?? 0) + 1,
  };
}

function pickDefaultChoirSlug(
  groups: string[],
  preferred?: string
): string {
  if (preferred && groups.includes(preferred)) return preferred;
  return groups[0] ?? "";
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
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [firstName, setFirstName] = useState(givenName);
  const [lastName, setLastName] = useState(familyName);
  const [choirSlug, setChoirSlug] = useState(() =>
    pickDefaultChoirSlug(userGroups, preferredChoirSlug)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signupMessage, setSignupMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const choirOptions: SelectOption[] = useMemo(
    () => userGroups.map((slug) => ({ value: slug, label: slug })),
    [userGroups]
  );

  const fetchList = useCallback(async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      // List API BatchGet-enriches viewerIsSignedUp — no per-row GetItem.
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
        extractApiErrorMessage(error, "Kunde inte hämta gemensamma konserter.")
      );
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    setFirstName(givenName);
    setLastName(familyName);
  }, [givenName, familyName]);

  useEffect(() => {
    setChoirSlug(pickDefaultChoirSlug(userGroups, preferredChoirSlug));
  }, [userGroups, preferredChoirSlug]);

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
      setListError("Kunde inte ladda fler konserter.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const openConcert = async (concert: SharedConcert) => {
    setSelected(concert);
    setDetailError(null);
    setSignupMessage(null);
    setIsLoadingDetail(true);
    try {
      const fresh = await getSharedConcert(concert.concertId);
      setSelected(fresh);
      setConcerts((prev) =>
        prev.map((c) =>
          c.concertId === fresh.concertId
            ? { ...c, ...fresh, signupCount: fresh.signupCount }
            : c
        )
      );
    } catch (error) {
      console.error("Failed to load concert detail", error);
      setDetailError(
        extractApiErrorMessage(error, "Kunde inte hämta konsertdetaljer.")
      );
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeModal = () => {
    setSelected(null);
    setDetailError(null);
    setSignupMessage(null);
  };

  const markSignedUpInUi = (concert: SharedConcert) => {
    const optimistic = applySignedUpLocalState(concert);
    setSelected(optimistic);
    setConcerts((prev) =>
      prev.map((c) =>
        c.concertId === optimistic.concertId ? { ...c, ...optimistic } : c
      )
    );
    setSignupMessage({
      type: "success",
      message: "Tack för din anmälan",
    });
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || isSubmitting) return;

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    if (!trimmedFirst) {
      setSignupMessage({ type: "error", message: "Förnamn krävs." });
      return;
    }
    if (!trimmedLast) {
      setSignupMessage({ type: "error", message: "Efternamn krävs." });
      return;
    }
    if (!choirSlug.trim()) {
      setSignupMessage({ type: "error", message: "Välj kör." });
      return;
    }

    setIsSubmitting(true);
    setSignupMessage(null);
    try {
      await createConcertSignup(selected.concertId, {
        firstName: trimmedFirst,
        lastName: trimmedLast,
        choirSlug: choirSlug.trim(),
      });
      markSignedUpInUi(selected);
    } catch (error) {
      if (isDuplicateSignupConflict(error)) {
        // Server already committed (e.g. timeout after 201) — succeed in UI.
        markSignedUpInUi(selected);
      } else {
        console.error("Failed to sign up for concert", error);
        setSignupMessage({
          type: "error",
          message: extractApiErrorMessage(error, "Kunde inte anmäla dig."),
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSignUp =
    Boolean(selected?.signupOpen) &&
    !selected?.viewerIsSignedUp &&
    userGroups.length > 0;

  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Gemensamma konserter för alla körer. Klicka på en konsert för att läsa
        mer och anmäla dig.
      </p>

      {isLoadingList && <p className={styles.muted}>Laddar konserter…</p>}
      {!isLoadingList && listError && (
        <p className={styles.error}>{listError}</p>
      )}
      {!isLoadingList && !listError && concerts.length === 0 && (
        <p className={styles.muted}>Inga gemensamma konserter just nu.</p>
      )}

      {!isLoadingList && concerts.length > 0 && (
        <ul className={styles.list}>
          {concerts.map((c) => (
            <li key={c.concertId}>
              <button
                type="button"
                className={styles.row}
                onClick={() => openConcert(c)}
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

      <Modal
        isOpen={Boolean(selected)}
        onClose={closeModal}
        title={selected?.title ?? "Konsert"}
      >
        {selected && (
          <div className={styles.modalBody}>
            <p className={styles.modalMeta}>
              <span>{formatConcertDate(selected.concertDate)}</span>
              <span>{selected.location}</span>
              <span>
                {selected.signupCount}{" "}
                {selected.signupCount === 1 ? "anmäld" : "anmälda"}
              </span>
            </p>

            {selected.description && (
              <p className={styles.modalDescription}>{selected.description}</p>
            )}

            {isLoadingDetail && (
              <p className={styles.muted}>Laddar…</p>
            )}
            {detailError && <p className={styles.error}>{detailError}</p>}

            {!isLoadingDetail && selected.viewerIsSignedUp && (
              <p className={styles.signedUpBanner} role="status">
                {signupMessage?.type === "success"
                  ? "Tack för din anmälan"
                  : "Du är redan anmäld"}
              </p>
            )}

            {!isLoadingDetail && !selected.signupOpen && !selected.viewerIsSignedUp && (
              <p className={styles.closedBanner}>
                Anmälan är stängd för denna konsert.
              </p>
            )}

            {!isLoadingDetail && canSignUp && (
              <form className={styles.signupForm} onSubmit={handleSignup} noValidate>
                {userGroups.length === 0 && (
                  <p className={styles.error}>
                    Du måste tillhöra minst en kör för att anmäla dig.
                  </p>
                )}

                {userGroups.length > 1 && (
                  <FormGroup label="Kör" htmlFor="signup-choir">
                    <StyledSelect
                      inputId="signup-choir"
                      options={choirOptions}
                      value={
                        choirOptions.find((o) => o.value === choirSlug) ?? null
                      }
                      onChange={(option) =>
                        setChoirSlug(option ? String(option.value) : "")
                      }
                      isDisabled={isSubmitting}
                      placeholder="Välj kör…"
                    />
                  </FormGroup>
                )}

                <FormGroup label="Förnamn" htmlFor="signup-first-name">
                  <Input
                    id="signup-first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    maxLength={80}
                    disabled={isSubmitting}
                    required
                  />
                </FormGroup>

                <FormGroup label="Efternamn" htmlFor="signup-last-name">
                  <Input
                    id="signup-last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    maxLength={80}
                    disabled={isSubmitting}
                    required
                  />
                </FormGroup>

                <Button
                  type="submit"
                  variant={ButtonVariant.Primary}
                  size={ButtonSize.Default}
                  disabled={isSubmitting || userGroups.length === 0}
                >
                  {isSubmitting ? "Anmäler…" : "Anmäl mig"}
                </Button>

                {signupMessage?.type === "error" && (
                  <p className={styles.error} role="status">
                    {signupMessage.message}
                  </p>
                )}
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
