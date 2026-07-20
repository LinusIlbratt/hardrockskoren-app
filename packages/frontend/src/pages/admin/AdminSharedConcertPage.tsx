import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  type FormEvent,
} from "react";
import axios from "axios";
import DatePicker, { registerLocale } from "react-datepicker";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  Button,
  ButtonSize,
  ButtonVariant,
} from "@/components/ui/button/Button";
import { FormGroup } from "@/components/ui/form/FormGroup";
import { Input } from "@/components/ui/input/Input";
import { Modal } from "@/components/ui/modal/Modal";
import {
  createSharedConcert,
  listSharedConcerts,
  listConcertSignups,
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
  const [activeTab, setActiveTab] = useState<"create" | "list">("create");

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
  const [signups, setSignups] = useState<ConcertSignup[]>([]);
  const [signupCount, setSignupCount] = useState(0);
  const [signupsHasMore, setSignupsHasMore] = useState(false);
  const [signupsNextBefore, setSignupsNextBefore] = useState<string | null>(
    null
  );
  const [signupsError, setSignupsError] = useState<string | null>(null);
  const [isLoadingSignups, setIsLoadingSignups] = useState(false);
  const [isLoadingMoreSignups, setIsLoadingMoreSignups] = useState(false);

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
        extractApiErrorMessage(error, "Kunde inte hämta gemensamma konserter.")
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
      setListError("Kunde inte ladda fler konserter.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const openDetail = async (concert: SharedConcert) => {
    setSelected(concert);
    setSignups([]);
    setSignupCount(concert.signupCount ?? 0);
    setSignupsHasMore(false);
    setSignupsNextBefore(null);
    setSignupsError(null);
    setIsLoadingSignups(true);
    try {
      const result = await listConcertSignups(concert.concertId, {
        limit: SIGNUPS_PAGE_SIZE,
      });
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
    } catch (error) {
      console.error("Failed to list signups", error);
      setSignupsError(
        extractApiErrorMessage(error, "Kunde inte hämta anmälningar.")
      );
    } finally {
      setIsLoadingSignups(false);
    }
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
        message: "Konserten har skapats.",
      });
      await fetchList();
      setActiveTab("list");
    } catch (error) {
      console.error("Failed to create shared concert", error);
      setStatusMessage({
        type: "error",
        message: extractApiErrorMessage(error, "Kunde inte skapa konserten."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Gemensamma konserter</h1>
      <p className={styles.subtitle}>
        Skapa gemensamma konserter och se vilka som anmält sig.
      </p>

      <div className={styles.tabs} role="tablist" aria-label="Gemensamma konserter">
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
          Konserter
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
            Fyll i uppgifterna och publicera en konsert som medlemmar från alla
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
              {isSubmitting ? "Skapar…" : "Skapa konsert"}
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
                Konserter och anmälningar
              </h2>
              <p className={styles.historySubtitle}>
                Klicka på en konsert för att se vem som anmält sig.
              </p>
            </div>

            {isLoadingList && <p className={styles.muted}>Laddar…</p>}
            {!isLoadingList && listError && (
              <p className={styles.error}>{listError}</p>
            )}
            {!isLoadingList && !listError && concerts.length === 0 && (
              <p className={styles.muted}>
                Inga konserter ännu. Skapa en under fliken Skapa.
              </p>
            )}

            {!isLoadingList && concerts.length > 0 && (
              <ul className={styles.historyList}>
                {concerts.map((c) => (
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
          </div>
        </section>
      )}

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Konsert"}
      >
        {selected && (
          <div className={styles.modalBody}>
            <p className={styles.modalMeta}>
              <span>{formatConcertDate(selected.concertDate)}</span>
              <span>{selected.location}</span>
              <span>
                {signupCount} {signupCount === 1 ? "anmäld" : "anmälda"}
              </span>
              {!selected.signupOpen && <span>Anmälan stängd</span>}
            </p>
            {selected.description && (
              <p className={styles.modalDescription}>{selected.description}</p>
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
                      <th>Förnamn</th>
                      <th>Efternamn</th>
                      <th>Kör</th>
                      <th>Anmäld</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signups.map((s) => (
                      <tr key={s.userUuid}>
                        <td>{s.firstName}</td>
                        <td>{s.lastName}</td>
                        <td>{s.choirName || s.choirSlug}</td>
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
                  {isLoadingMoreSignups ? "Laddar…" : "Ladda fler anmälningar"}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
