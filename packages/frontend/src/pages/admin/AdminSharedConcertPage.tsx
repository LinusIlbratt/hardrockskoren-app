import { useRef, useState, forwardRef } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { sv } from "date-fns/locale";
import { FiEdit } from "react-icons/fi";
import {
  Button,
  ButtonSize,
  ButtonVariant,
} from "@/components/ui/button/Button";
import { FormGroup } from "@/components/ui/form/FormGroup";
import { Cluster } from "@/components/ui/layout/Cluster";
import { Input } from "@/components/ui/input/Input";
import { Textarea } from "@/components/ui/textarea/Textarea";
import { Tab, Tabs } from "@/components/ui/tabs/Tabs";
import { LinkifiedText } from "@/components/ui/LinkifiedText";
import { Modal } from "@/components/ui/modal/Modal";
import {
  useSharedConcertDetail,
  useSharedConcertForm,
  useSharedConcertList,
} from "@/features/concerts";
import type { SharedConcert } from "@/services/concertService";
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

export const AdminSharedConcertPage = () => {
  const [activeTab, setActiveTab] = useState<"create" | "list">("list");
  const resetEditorRef = useRef<() => void>(() => {});

  const {
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
  } = useSharedConcertList(activeTab);

  const {
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
  } = useSharedConcertDetail({
    resetEditor: () => resetEditorRef.current(),
    patchConcert,
  });

  const {
    title,
    setTitle,
    concertDate,
    setConcertDate,
    location,
    setLocation,
    description,
    setDescription,
    isSubmitting,
    statusMessage,
    handleSubmit,
    isEditingConcert,
    editTitle,
    setEditTitle,
    editDate,
    setEditDate,
    editLocation,
    setEditLocation,
    editDescription,
    setEditDescription,
    editError,
    isSavingEdit,
    saveConcertEdit,
    resetConcertEditor,
    startEditing,
  } = useSharedConcertForm({
    selected,
    setSelected,
    patchConcert,
    fetchList,
    setActiveTab,
  });

  resetEditorRef.current = resetConcertEditor;

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

      <Tabs label="Gemensamma Gig" className={styles.tabs}>
        <Tab
          id="tab-create"
          controls="panel-create"
          active={activeTab === "create"}
          onSelect={() => setActiveTab("create")}
        >
          Skapa
        </Tab>
        <Tab
          id="tab-list"
          controls="panel-list"
          active={activeTab === "list"}
          onSelect={() => setActiveTab("list")}
        >
          Gig
        </Tab>
      </Tabs>

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
              <Textarea
                id="shared-concert-desc"
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
              <Cluster justify="center" className={styles.loadMore}>
                <Button
                  type="button"
                  variant={ButtonVariant.Ghost}
                  size={ButtonSize.Small}
                  disabled={isLoadingMore}
                  onClick={loadMoreConcerts}
                >
                  {isLoadingMore ? "Laddar…" : "Ladda fler"}
                </Button>
              </Cluster>
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
            <Tabs label="Gigdetaljer">
              <Tab
                id="gig-tab-signups"
                controls="gig-panel-signups"
                active={detailTab === "signups"}
                onSelect={() => setDetailTab("signups")}
              >
                Anmälningar ({signupCount})
              </Tab>
              <Tab
                id="gig-tab-info"
                controls="gig-panel-info"
                active={detailTab === "info"}
                onSelect={() => setDetailTab("info")}
              >
                Information
              </Tab>
            </Tabs>

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
                  <Cluster justify="center" className={styles.loadMore}>
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
                  </Cluster>
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
                      <Textarea
                        id="edit-shared-concert-desc"
                        className="whitespace-pre-wrap"
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

                    <Cluster justify="end" gap="sm">
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
                    </Cluster>
                  </form>
                ) : (
                  <>
                    <Cluster justify="end">
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
                    </Cluster>
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
