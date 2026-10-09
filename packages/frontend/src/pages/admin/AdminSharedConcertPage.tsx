import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  forwardRef,
  type FormEvent,
} from "react";
import axios from "axios";
import DatePicker, { registerLocale } from "react-datepicker";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { FiEdit } from "react-icons/fi";
import {
  Button,
  ButtonSize,
  ButtonVariant,
} from "@/components/ui/button/Button";
import { FormGroup } from "@/components/ui/form/FormGroup";
import { Input } from "@/components/ui/input/Input";
import { LinkifiedText } from "@/components/ui/LinkifiedText";
import { Modal } from "@/components/ui/modal/Modal";
import {
  createSharedConcert,
  listSharedConcerts,
  listConcertSignups,
  getSharedConcert,
  updateSharedConcert,
  VOICE_PARTS,
  type SharedConcert,
  type ConcertSignup,
} from "@/services/concertService";
import styles from "./AdminSharedConcertPage.module.scss";

registerLocale("sv", sv);

const CustomDateInput = forwardRef<
  HTMLButtonElement,
  {
    value?: string;
    onClick?: () => void;
    className?: string;
    placeholder?: string;
    disabled?: boolean;
  }
>(({ value, onClick, className, placeholder, disabled }, ref) => (
  <button
    type="button"
    className={className}
    onClick={onClick}
    ref={ref}
    disabled={disabled}
  >
    {value || placeholder}
  </button>
));
CustomDateInput.displayName = "CustomDateInput";

const LIST_PAGE_SIZE = 20;
const SIGNUPS_PAGE_SIZE = 50;

/** YYYY-MM-DD for "today" in Europe/Stockholm (same rule as signupOpen). */
function todayInStockholm(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

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

function compareConcertDateAsc(a: SharedConcert, b: SharedConcert): number {
  const byDate = a.concertDate.localeCompare(b.concertDate);
  if (byDate !== 0) return byDate;
  return a.concertId.localeCompare(b.concertId);
}

function compareConcertDateDesc(a: SharedConcert, b: SharedConcert): number {
  return compareConcertDateAsc(b, a);
}

function dateFromConcertDate(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Shared gigs have no choir targets today; every gig is for all choirs. */
function formatConcertAudience(concert: SharedConcert): string {
  if (concert.scope === "groups" && concert.targets && concert.targets.length > 0) {
    const names = concert.targets
      .map((target) => target.trim())
      .filter((target) => target && target.toUpperCase() !== "ALL");
    if (names.length > 0) return names.join(", ");
  }
  return "Alla körer";
}

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

function formatSignupTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
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

export const AdminSharedConcertPage = () => {
  const [activeTab, setActiveTab] = useState<"create" | "list">("list");

  const [title, setTitle] = useState("");
  const [concertDate, setConcertDate] = useState<Date | null>(null);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [concerts, setConcerts] = useState<SharedConcert[]>([]);
  const [listHasMore, setListHasMore] = useState(false);
  const [listNextBefore, setListNextBefore] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [selected, setSelected] = useState<SharedConcert | null>(null);
  const [detailTab, setDetailTab] = useState<"signups" | "info">("signups");
  const [isEditingConcert, setIsEditingConcert] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState<Date | null>(null);
  const [editLocation, setEditLocation] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
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

  const resetConcertEditor = () => {
    setIsEditingConcert(false);
    setEditError(null);
    setIsSavingEdit(false);
  };

  const closeDetail = () => {
    detailRequestRef.current += 1;
    setSelected(null);
    setDetailTab("signups");
    setIsLoadingDetail(false);
    setDetailError(null);
    resetConcertEditor();
  };

  const startEditing = (concert: SharedConcert) => {
    setEditTitle(concert.title);
    setEditDate(dateFromConcertDate(concert.concertDate));
    setEditLocation(concert.location);
    setEditDescription(concert.description ?? "");
    setEditError(null);
    setIsEditingConcert(true);
  };

  const saveConcertEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || isSavingEdit) return;

    const trimmedTitle = editTitle.trim();
    const trimmedLocation = editLocation.trim();
    const trimmedDescription = editDescription.trim();
    if (!trimmedTitle) {
      setEditError("Titel krävs.");
      return;
    }
    if (trimmedTitle.length > 120) {
      setEditError("Titeln får vara högst 120 tecken.");
      return;
    }
    if (!editDate) {
      setEditError("Datum krävs.");
      return;
    }
    if (!trimmedLocation) {
      setEditError("Plats krävs.");
      return;
    }
    if (trimmedLocation.length > 120) {
      setEditError("Platsen får vara högst 120 tecken.");
      return;
    }
    if (trimmedDescription.length > 4000) {
      setEditError("Beskrivningen får vara högst 4000 tecken.");
      return;
    }

    const concertDateIso = format(editDate, "yyyy-MM-dd");
    const previousDescription = selected.description?.trim() ?? "";
    const unchanged =
      trimmedTitle === selected.title.trim() &&
      concertDateIso === selected.concertDate &&
      trimmedLocation === selected.location.trim() &&
      trimmedDescription === previousDescription;
    if (unchanged) {
      setIsEditingConcert(false);
      setEditError(null);
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    try {
      const updated = await updateSharedConcert(selected.concertId, {
        title: trimmedTitle,
        concertDate: concertDateIso,
        location: trimmedLocation,
        description: trimmedDescription || null,
        version: selected.version ?? 1,
      });
      const next: SharedConcert = {
        ...selected,
        ...updated,
        description: updated.description,
        signupCount: updated.signupCount ?? selected.signupCount,
      };
      setSelected(next);
      setConcerts((prev) =>
        prev.map((concert) =>
          concert.concertId === next.concertId ? { ...concert, ...next } : concert
        )
      );
      setIsEditingConcert(false);
    } catch (error) {
      console.error("Failed to update shared concert", error);
      setEditError(
        extractApiErrorMessage(error, "Kunde inte spara ändringarna.")
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openDetail = async (concert: SharedConcert) => {
    const requestId = ++detailRequestRef.current;
    const stillOpen = () => detailRequestRef.current === requestId;

    setSelected(concert);
    setDetailTab("signups");
    resetConcertEditor();
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
        setConcerts((prev) =>
          prev.map((c) =>
            c.concertId === concert.concertId
              ? { ...c, signupCount: result.signupCount }
              : c
          )
        );
      })
      .catch((error) => {
        if (!stillOpen()) return;
        console.error("Failed to list signups", error);
        setSignupsError(
          extractApiErrorMessage(error, "Kunde inte hämta anmälningar.")
        );
      })
      .finally(() => {
        if (stillOpen()) setIsLoadingSignups(false);
      });

    const detailTask = getSharedConcert(concert.concertId)
      .then((fresh) => {
        if (!stillOpen()) return;
        setSelected((prev) => {
          if (!prev || prev.concertId !== concert.concertId) return prev;
          return {
            ...prev,
            ...fresh,
            description: fresh.description,
            signupCount: prev.signupCount,
          };
        });
        setConcerts((prev) =>
          prev.map((c) =>
            c.concertId === fresh.concertId
              ? {
                  ...c,
                  ...fresh,
                  description: fresh.description,
                  signupCount: c.signupCount,
                }
              : c
          )
        );
      })
      .catch((error) => {
        if (!stillOpen()) return;
        console.error("Failed to load concert detail", error);
        setDetailError(
          extractApiErrorMessage(error, "Kunde inte hämta gigdetaljer.")
        );
      })
      .finally(() => {
        if (stillOpen()) setIsLoadingDetail(false);
      });

    await Promise.all([signupsTask, detailTask]);
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

  useEffect(() => {
    // Fetch on mount and whenever the list tab is shown (not on create tab).
    if (activeTab === "list") {
      fetchList();
    }
  }, [activeTab, fetchList]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedTitle = title.trim();
    const trimmedLocation = location.trim();
    if (!trimmedTitle) {
      setStatusMessage({ type: "error", message: "Titel krävs." });
      return;
    }
    if (!concertDate) {
      setStatusMessage({ type: "error", message: "Datum krävs." });
      return;
    }
    if (!trimmedLocation) {
      setStatusMessage({ type: "error", message: "Stad/plats krävs." });
      return;
    }

    const concertDateIso = format(concertDate, "yyyy-MM-dd");

    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      await createSharedConcert({
        title: trimmedTitle,
        concertDate: concertDateIso,
        location: trimmedLocation,
        description: description.trim() || undefined,
      });
      setTitle("");
      setConcertDate(null);
      setLocation("");
      setDescription("");
      setStatusMessage({
        type: "success",
        message: "Giget har skapats.",
      });
      await fetchList();
      setActiveTab("list");
    } catch (error) {
      console.error("Failed to create shared concert", error);
      setStatusMessage({
        type: "error",
        message: extractApiErrorMessage(error, "Kunde inte skapa giget."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderConcertRow = (c: SharedConcert) => (
    <li key={c.concertId}>
      <button
        type="button"
        className={styles.historyRow}
        onClick={() => openDetail(c)}
      >
        <span className={styles.historyRowMain}>
          <span className={styles.historyItemTitle}>{c.title}</span>
          <span className={styles.historyMetaLine}>
            {formatConcertDate(c.concertDate)}
            {c.location ? ` · ${c.location}` : ""}
            {!c.signupOpen ? " · stängd" : ""}
          </span>
        </span>
        <span className={styles.historyRowMeta}>
          <span className={styles.countBadge}>
            {c.signupCount}{" "}
            {c.signupCount === 1 ? "anmäld" : "anmälda"}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Gemensamma Gig</h1>
      <p className={styles.subtitle}>
        Skapa gemensamma gig och se vilka som anmält sig.
      </p>

      <div className={styles.tabs} role="tablist" aria-label="Gemensamma Gig">
        <button
          type="button"
          role="tab"
          id="tab-create"
          aria-selected={activeTab === "create"}
          aria-controls="panel-create"
          className={`${styles.tabButton} ${activeTab === "create" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("create")}
        >
          Skapa
        </button>
        <button
          type="button"
          role="tab"
          id="tab-list"
          aria-selected={activeTab === "list"}
          aria-controls="panel-list"
          className={`${styles.tabButton} ${activeTab === "list" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("list")}
        >
          Gig
        </button>
      </div>

      {activeTab === "create" && (
        <section
          id="panel-create"
          role="tabpanel"
          aria-labelledby="tab-create"
          className={styles.tabPanel}
        >
          <p className={styles.panelIntro}>
            Fyll i uppgifterna och publicera ett gig som medlemmar från alla
            körer kan anmäla sig till.
          </p>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <FormGroup label="Titel" htmlFor="shared-concert-title">
              <Input
                id="shared-concert-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                disabled={isSubmitting}
                required
              />
            </FormGroup>

            <FormGroup label="Datum" htmlFor="shared-concert-date">
              <DatePicker
                id="shared-concert-date"
                selected={concertDate}
                onChange={(date: Date | null) => setConcertDate(date)}
                dateFormat="yyyy-MM-dd"
                locale="sv"
                minDate={new Date()}
                disabled={isSubmitting}
                required
                popperClassName={styles.datePickerPopper}
                customInput={
                  <CustomDateInput
                    className={styles.datePickerInput}
                    placeholder="Välj datum"
                  />
                }
              />
            </FormGroup>

            <FormGroup label="Stad / plats" htmlFor="shared-concert-location">
              <Input
                id="shared-concert-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                maxLength={120}
                disabled={isSubmitting}
                required
              />
            </FormGroup>

            <FormGroup
              label="Beskrivning (valfritt)"
              htmlFor="shared-concert-desc"
            >
              <textarea
                id="shared-concert-desc"
                className={styles.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
                disabled={isSubmitting}
                rows={4}
              />
            </FormGroup>

            <Button
              type="submit"
              variant={ButtonVariant.Primary}
              size={ButtonSize.Default}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Skapar…" : "Skapa gig"}
            </Button>

            {statusMessage && (
              <p
                className={
                  statusMessage.type === "success"
                    ? styles.success
                    : styles.error
                }
                role="status"
              >
                {statusMessage.message}
              </p>
            )}
          </form>
        </section>
      )}

      {activeTab === "list" && (
        <section
          id="panel-list"
          role="tabpanel"
          aria-labelledby="tab-list"
          className={styles.tabPanel}
        >
          <div className={styles.history}>
            <div className={styles.historySticky}>
              <h2 id="concert-list-heading" className={styles.historyTitle}>
                Gig och anmälningar
              </h2>
              <p className={styles.historySubtitle}>
                Klicka på ett gig för att se vem som anmält sig.
              </p>
            </div>

            {isLoadingList && <p className={styles.muted}>Laddar…</p>}
            {!isLoadingList && listError && (
              <p className={styles.error}>{listError}</p>
            )}
            {!isLoadingList && !listError && concerts.length === 0 && (
              <p className={styles.muted}>
                Inga gig ännu. Skapa ett under fliken Skapa.
              </p>
            )}

            {!isLoadingList && concerts.length > 0 && (
              <div className={styles.concertSections}>
                <section
                  className={styles.concertSection}
                  aria-labelledby="upcoming-concerts-heading"
                >
                  <h3
                    id="upcoming-concerts-heading"
                    className={styles.sectionHeading}
                  >
                    Aktuella / kommande
                  </h3>
                  {upcomingConcerts.length > 0 ? (
                    <ul className={styles.historyList}>
                      {upcomingConcerts.map(renderConcertRow)}
                    </ul>
                  ) : (
                    <p className={styles.muted}>Inga kommande gig.</p>
                  )}
                </section>

                <hr className={styles.sectionDivider} />

                <section
                  className={styles.concertSection}
                  aria-labelledby="past-concerts-heading"
                >
                  <h3
                    id="past-concerts-heading"
                    className={styles.sectionHeading}
                  >
                    Tidigare gig
                  </h3>
                  {pastConcerts.length > 0 ? (
                    <ul className={styles.historyList}>
                      {pastConcerts.map(renderConcertRow)}
                    </ul>
                  ) : (
                    <p className={styles.muted}>Inga tidigare gig.</p>
                  )}
                </section>
              </div>
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
          </div>
        </section>
      )}

      <Modal
        isOpen={Boolean(selected)}
        onClose={closeDetail}
        title={selected?.title ?? "Gig"}
        formMode={isEditingConcert}
      >
        {selected && (
          <div className={styles.modalBody}>
            <div
              className={styles.modalTabs}
              role="tablist"
              aria-label="Gigdetaljer"
            >
              <button
                type="button"
                role="tab"
                id="gig-tab-signups"
                aria-selected={detailTab === "signups"}
                aria-controls="gig-panel-signups"
                className={`${styles.tabButton} ${detailTab === "signups" ? styles.activeTab : ""}`}
                onClick={() => setDetailTab("signups")}
              >
                Anmälningar ({signupCount})
              </button>
              <button
                type="button"
                role="tab"
                id="gig-tab-info"
                aria-selected={detailTab === "info"}
                aria-controls="gig-panel-info"
                className={`${styles.tabButton} ${detailTab === "info" ? styles.activeTab : ""}`}
                onClick={() => setDetailTab("info")}
              >
                Information
              </button>
            </div>

            {detailTab === "signups" && (
              <div
                id="gig-panel-signups"
                role="tabpanel"
                aria-labelledby="gig-tab-signups"
                className={styles.modalPanel}
              >
                {!selected.signupOpen && (
                  <p className={styles.muted}>Anmälan stängd</p>
                )}
                {voicePartSummary && (
                  <p className={styles.voiceSummary}>{voicePartSummary}</p>
                )}

                {isLoadingSignups && (
                  <p className={styles.muted}>Laddar anmälningar…</p>
                )}
                {signupsError && <p className={styles.error}>{signupsError}</p>}

                {!isLoadingSignups && !signupsError && signups.length === 0 && (
                  <p className={styles.muted}>Inga anmälningar ännu.</p>
                )}

                {signups.length > 0 && (
                  <div className={styles.tableWrap}>
                    <table className={styles.signupTable}>
                      <thead>
                        <tr>
                          <th className={styles.colNr} scope="col">
                            Nr
                          </th>
                          <th>Förnamn</th>
                          <th>Efternamn</th>
                          <th>Kör</th>
                          <th>Stämma</th>
                          <th>Anmäld</th>
                        </tr>
                      </thead>
                      <tbody>
                        {signups.map((s, index) => (
                          <tr key={s.userUuid}>
                            <td className={styles.colNr}>{index + 1}</td>
                            <td>{s.firstName}</td>
                            <td>{s.lastName}</td>
                            <td>{s.choirName || s.choirSlug}</td>
                            <td>{s.voicePart ?? "—"}</td>
                            <td>{formatSignupTime(s.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {signupsHasMore && (
                  <div className={styles.loadMore}>
                    <Button
                      type="button"
                      variant={ButtonVariant.Ghost}
                      size={ButtonSize.Small}
                      disabled={isLoadingMoreSignups}
                      onClick={loadMoreSignups}
                    >
                      {isLoadingMoreSignups
                        ? "Laddar…"
                        : "Ladda fler anmälningar"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {detailTab === "info" && (
              <div
                id="gig-panel-info"
                role="tabpanel"
                aria-labelledby="gig-tab-info"
                className={styles.modalPanel}
              >
                {isEditingConcert ? (
                  <form
                    className={styles.form}
                    onSubmit={saveConcertEdit}
                    noValidate
                  >
                    <FormGroup label="Titel" htmlFor="edit-shared-concert-title">
                      <Input
                        id="edit-shared-concert-title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        maxLength={120}
                        disabled={isSavingEdit}
                        required
                      />
                    </FormGroup>

                    <FormGroup label="Datum" htmlFor="edit-shared-concert-date">
                      <DatePicker
                        id="edit-shared-concert-date"
                        selected={editDate}
                        onChange={(date: Date | null) => setEditDate(date)}
                        dateFormat="yyyy-MM-dd"
                        locale="sv"
                        disabled={isSavingEdit}
                        required
                        popperClassName={styles.datePickerPopper}
                        customInput={
                          <CustomDateInput
                            className={styles.datePickerInput}
                            placeholder="Välj datum"
                          />
                        }
                      />
                    </FormGroup>

                    <FormGroup
                      label="Stad / plats"
                      htmlFor="edit-shared-concert-location"
                    >
                      <Input
                        id="edit-shared-concert-location"
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        maxLength={120}
                        disabled={isSavingEdit}
                        required
                      />
                    </FormGroup>

                    <FormGroup
                      label="Beskrivning (valfritt)"
                      htmlFor="edit-shared-concert-desc"
                    >
                      <textarea
                        id="edit-shared-concert-desc"
                        className={`${styles.textarea} whitespace-pre-wrap`}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        maxLength={4000}
                        disabled={isSavingEdit}
                        rows={6}
                      />
                    </FormGroup>

                    {editError && (
                      <p className={styles.error} role="alert">
                        {editError}
                      </p>
                    )}

                    <div className={styles.editActions}>
                      <Button
                        type="button"
                        variant={ButtonVariant.Ghost}
                        size={ButtonSize.Small}
                        disabled={isSavingEdit}
                        onClick={resetConcertEditor}
                      >
                        Avbryt
                      </Button>
                      <Button
                        type="submit"
                        variant={ButtonVariant.Primary}
                        size={ButtonSize.Small}
                        disabled={isSavingEdit}
                      >
                        {isSavingEdit ? "Sparar…" : "Spara"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className={styles.infoHeader}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label="Redigera"
                        title="Redigera"
                        disabled={isLoadingDetail}
                        onClick={() => startEditing(selected)}
                      >
                        <FiEdit aria-hidden size={16} />
                      </button>
                    </div>
                    <dl className={styles.detailList}>
                      <div className={styles.detailRow}>
                        <dt className={styles.detailLabel}>Datum</dt>
                        <dd className={styles.detailValue}>
                          {formatConcertDate(selected.concertDate)}
                        </dd>
                      </div>
                      <div className={styles.detailRow}>
                        <dt className={styles.detailLabel}>Tid</dt>
                        <dd className={styles.detailValue}>Inte angiven</dd>
                      </div>
                      <div className={styles.detailRow}>
                        <dt className={styles.detailLabel}>Plats</dt>
                        <dd className={styles.detailValue}>
                          {selected.location || "Plats saknas"}
                        </dd>
                      </div>
                      <div className={styles.detailRow}>
                        <dt className={styles.detailLabel}>Körer</dt>
                        <dd className={styles.detailValue}>
                          {formatConcertAudience(selected)}
                        </dd>
                      </div>
                    </dl>
                    {isLoadingDetail ? (
                      <p className={styles.muted}>Laddar beskrivning…</p>
                    ) : detailError && !selected.description ? (
                      <p className={styles.error} role="alert">
                        {detailError}
                      </p>
                    ) : selected.description ? (
                      <p
                        className={`${styles.modalDescription} whitespace-pre-wrap`}
                      >
                        <LinkifiedText text={selected.description} />
                      </p>
                    ) : (
                      <p className={styles.muted}>Ingen beskrivning.</p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
