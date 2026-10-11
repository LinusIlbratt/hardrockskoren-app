import { useRef, useState, forwardRef } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { sv } from "date-fns/locale";
import { FiEdit } from "react-icons/fi";
import { IoEyeOutline, IoTrashOutline } from "react-icons/io5";
import {
  Button,
  ButtonSize,
  ButtonVariant,
} from "@/components/ui/button/Button";
import { FormGroup } from "@/components/ui/form/FormGroup";
import { Cluster } from "@/components/ui/layout/Cluster";
import { Input } from "@/components/ui/input/Input";
import { StyledSelect, type SelectOption } from "@/components/ui/select/StyledSelect";
import { MarkdownText } from "@/components/ui/markdown/MarkdownText";
import { MarkdownTextarea } from "@/components/ui/markdown/MarkdownTextarea";
import { Modal } from "@/components/ui/modal/Modal";
import {
  useSharedConcertDetail,
  useSharedConcertForm,
  useSharedConcertList,
} from "@/features/concerts";
import { deleteSharedConcert, type SharedConcert } from "@/services/concertService";
import { extractSharedConcertError } from "@/features/concerts/hooks/sharedConcertError";
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

function formatConcertAudience(
  concert: SharedConcert,
  names: Map<string, string>
): string {
  if (concert.scope === "groups" && concert.targets && concert.targets.length > 0) {
    const labels = concert.targets
      .map((target) => target.trim())
      .filter((target) => target && target.toUpperCase() !== "ALL")
      .map((target) => names.get(target) ?? target);
    if (labels.length > 0) return labels.join(", ");
  }
  return "Alla körer";
}

function selectedChoirOptions(
  slugs: string[],
  options: SelectOption[]
): SelectOption[] {
  return slugs.map(
    (slug) => options.find((option) => option.value === slug) ?? { value: slug, label: slug }
  );
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
    audienceMode,
    setAudienceMode,
    targetSlugs,
    setTargetSlugs,
    editAudienceMode,
    setEditAudienceMode,
    editTargetSlugs,
    setEditTargetSlugs,
    groupOptions,
    groupsBySlug,
    groupsError,
    isLoadingGroups,
  } = useSharedConcertForm({
    selected,
    setSelected,
    patchConcert,
    fetchList,
    setActiveTab,
  });

  resetEditorRef.current = resetConcertEditor;

  const [concertToDelete, setConcertToDelete] = useState<SharedConcert | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!concertToDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSharedConcert(concertToDelete.concertId);
      if (selected?.concertId === concertToDelete.concertId) closeDetail();
      setConcertToDelete(null);
      await fetchList();
    } catch (error) {
      console.error("Failed to delete shared concert", error);
      setDeleteError(extractSharedConcertError(error, "Kunde inte ta bort giget."));
    } finally {
      setIsDeleting(false);
    }
  };

  const renderConcertRow = (c: SharedConcert, tone: "current" | "past") => (
    <li
      key={c.concertId}
      className={
        tone === "past"
          ? `${styles.historyRow} ${styles.historyRowPast}`
          : `${styles.historyRow} ${styles.historyRowCurrent}`
      }
    >
      <span className={styles.historyRowMain}>
        <span className={styles.historyItemTitle}>{c.title}</span>
        <span className={styles.historyMetaLine}>
          {formatConcertDate(c.concertDate)}
          {c.location ? ` · ${c.location}` : ""}
          {` · ${formatConcertAudience(c, groupsBySlug)}`}
        </span>
      </span>
      <span className={styles.historyRowMeta}>
        <span className={styles.countBadge}>
          {c.signupCount} {c.signupCount === 1 ? "anmäld" : "anmälda"}
        </span>
        <span className={styles.rowActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Visa gig"
            title="Visa gig"
            onClick={() => openDetail(c)}
          >
            <IoEyeOutline size={18} aria-hidden />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Redigera gig"
            title="Redigera gig"
            onClick={() => {
              void openDetail(c).then((freshConcert) => {
                setDetailTab("info");
                startEditing(freshConcert ?? c);
              });
            }}
          >
            <FiEdit size={16} aria-hidden />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.deleteIcon}`}
            aria-label="Ta bort gig"
            title="Ta bort gig"
            onClick={() => {
              setDeleteError(null);
              setConcertToDelete(c);
            }}
          >
            <IoTrashOutline size={18} aria-hidden />
          </button>
        </span>
      </span>
    </li>
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Gemensamma Gig</h1>

      <div className={styles.segment} role="tablist" aria-label="Gemensamma Gig">
        <button
          type="button"
          role="tab"
          id="tab-list"
          aria-selected={activeTab === "list"}
          aria-controls="panel-list"
          className={styles.segmentButton}
          onClick={() => setActiveTab("list")}
        >
          Alla gig
        </button>
        <button
          type="button"
          role="tab"
          id="tab-create"
          aria-selected={activeTab === "create"}
          aria-controls="panel-create"
          className={styles.segmentButton}
          onClick={() => setActiveTab("create")}
        >
          Skapa nytt
        </button>
      </div>

      {statusMessage && (
        <p
          className={
            statusMessage.type === "success" ? styles.success : styles.error
          }
          role="status"
        >
          {statusMessage.message}
        </p>
      )}

      {activeTab === "create" && (
        <section
          id="panel-create"
          role="tabpanel"
          aria-labelledby="tab-create"
          className={styles.tabPanel}
        >
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

            <fieldset className={styles.audienceFieldset}>
              <legend className={styles.audienceLegend}>Målgrupp</legend>
              <div className={styles.recipientRadioGroup} role="radiogroup" aria-label="Välj målgrupp">
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="concert-audience"
                    value="all"
                    checked={audienceMode === "all"}
                    onChange={() => setAudienceMode("all")}
                    disabled={isSubmitting}
                    className={styles.radioInput}
                  />
                  <span className={styles.radioCircle} />
                  <span className={styles.radioLabel}>Alla körer</span>
                </label>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="concert-audience"
                    value="selected"
                    checked={audienceMode === "selected"}
                    onChange={() => setAudienceMode("selected")}
                    disabled={isSubmitting}
                    className={styles.radioInput}
                  />
                  <span className={styles.radioCircle} />
                  <span className={styles.radioLabel}>Valda körer</span>
                </label>
              </div>
            </fieldset>

            {audienceMode === "selected" && (
              <FormGroup
                label="Körer"
                htmlFor="shared-concert-targets"
                error={groupsError && groupOptions.length === 0 ? groupsError : null}
              >
                <StyledSelect
                  inputId="shared-concert-targets"
                  isMulti
                  options={groupOptions}
                  value={selectedChoirOptions(targetSlugs, groupOptions)}
                  onChange={(opts) =>
                    setTargetSlugs(opts ? opts.map((option) => String(option.value)) : [])
                  }
                  placeholder={isLoadingGroups ? "Laddar körer…" : "Välj en eller flera körer…"}
                  isDisabled={isSubmitting || isLoadingGroups || groupOptions.length === 0}
                  isLoading={isLoadingGroups}
                  closeMenuOnSelect={false}
                  noOptionsMessage={() => "Inga körer att välja"}
                />
              </FormGroup>
            )}

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
              <MarkdownTextarea
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
              className={styles.submitButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Skapar…" : "Skapa gig"}
            </Button>
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
            {isLoadingList && <p className={styles.muted}>Laddar…</p>}
            {!isLoadingList && listError && (
              <p className={styles.error}>{listError}</p>
            )}
            {!isLoadingList && !listError && concerts.length === 0 && (
              <p className={styles.muted}>
                Inga gig ännu. Skapa ett under fliken Skapa nytt.
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
                      {upcomingConcerts.map((concert) =>
                        renderConcertRow(concert, "current"),
                      )}
                    </ul>
                  ) : (
                    <p className={styles.muted}>Inga kommande gig.</p>
                  )}
                </section>

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
                      {pastConcerts.map((concert) =>
                        renderConcertRow(concert, "past"),
                      )}
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
        size="lg"
        tone="luxury"
        headerAction={
          selected && !isEditingConcert ? (
            <button
              type="button"
              className={styles.headerEdit}
              aria-label="Redigera gig"
              title="Redigera gig"
              disabled={isLoadingDetail}
              onClick={() => {
                setDetailTab("info");
                startEditing(selected);
              }}
            >
              <FiEdit aria-hidden size={18} />
            </button>
          ) : null
        }
      >
        {selected && (
          <div className={styles.modalBody}>
            <div className={styles.modalTabs} role="tablist" aria-label="Gigdetaljer">
              <button
                type="button"
                role="tab"
                id="gig-tab-signups"
                aria-selected={detailTab === "signups"}
                aria-controls="gig-panel-signups"
                className={styles.modalTab}
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
                className={styles.modalTab}
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
                  <ul className={styles.voiceRow}>
                    {voicePartSummary.split(" · ").map((part) => (
                      <li key={part} className={styles.voicePill}>
                        {part}
                      </li>
                    ))}
                  </ul>
                )}

                {isLoadingSignups && (
                  <p className={styles.muted}>Laddar anmälningar…</p>
                )}
                {signupsError && <p className={styles.error}>{signupsError}</p>}

                {!isLoadingSignups && !signupsError && signups.length === 0 && (
                  <p className={styles.muted}>Inga anmälningar ännu.</p>
                )}

                {signups.length > 0 && (
                  <>
                  <ul className={styles.signupCards}>
                    {signups.map((s, index) => (
                      <li key={s.userUuid} className={styles.signupCard}>
                        <div className={styles.signupCardTop}>
                          <span className={styles.signupNr}>{index + 1}</span>
                          <span className={styles.signupName}>
                            {s.firstName} {s.lastName}
                          </span>
                          <span className={styles.voiceBadge}>
                            {s.voicePart ?? "—"}
                          </span>
                        </div>
                        <p className={styles.signupChoir}>
                          {s.choirName || s.choirSlug}
                        </p>
                      </li>
                    ))}
                  </ul>
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
                  </>
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

                    <fieldset className={styles.audienceFieldset}>
                      <legend className={styles.audienceLegend}>Målgrupp</legend>
                      <div className={styles.recipientRadioGroup} role="radiogroup" aria-label="Välj målgrupp">
                        <label className={styles.radioOption}>
                          <input
                            type="radio"
                            name="edit-concert-audience"
                            value="all"
                            checked={editAudienceMode === "all"}
                            onChange={() => setEditAudienceMode("all")}
                            disabled={isSavingEdit}
                            className={styles.radioInput}
                          />
                          <span className={styles.radioCircle} />
                          <span className={styles.radioLabel}>Alla körer</span>
                        </label>
                        <label className={styles.radioOption}>
                          <input
                            type="radio"
                            name="edit-concert-audience"
                            value="selected"
                            checked={editAudienceMode === "selected"}
                            onChange={() => setEditAudienceMode("selected")}
                            disabled={isSavingEdit}
                            className={styles.radioInput}
                          />
                          <span className={styles.radioCircle} />
                          <span className={styles.radioLabel}>Valda körer</span>
                        </label>
                      </div>
                    </fieldset>

                    {editAudienceMode === "selected" && (
                      <FormGroup
                        label="Körer"
                        htmlFor="edit-shared-concert-targets"
                        error={groupsError && groupOptions.length === 0 ? groupsError : null}
                      >
                        <StyledSelect
                          inputId="edit-shared-concert-targets"
                          isMulti
                          options={groupOptions}
                          value={selectedChoirOptions(editTargetSlugs, groupOptions)}
                          onChange={(opts) =>
                            setEditTargetSlugs(
                              opts ? opts.map((option) => String(option.value)) : []
                            )
                          }
                          placeholder={isLoadingGroups ? "Laddar körer…" : "Välj en eller flera körer…"}
                          isDisabled={isSavingEdit || isLoadingGroups || groupOptions.length === 0}
                          isLoading={isLoadingGroups}
                          closeMenuOnSelect={false}
                          noOptionsMessage={() => "Inga körer att välja"}
                        />
                      </FormGroup>
                    )}

                    <FormGroup
                      label="Beskrivning (valfritt)"
                      htmlFor="edit-shared-concert-desc"
                    >
                      <MarkdownTextarea
                        id="edit-shared-concert-desc"
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
                          {formatConcertAudience(selected, groupsBySlug)}
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
                      <MarkdownText
                        className={styles.modalDescription}
                        text={selected.description}
                      />
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

      <Modal
        isOpen={Boolean(concertToDelete)}
        onClose={() => {
          if (isDeleting) return;
          setConcertToDelete(null);
          setDeleteError(null);
        }}
        title="Ta bort gig?"
        tone="luxury"
        size="compact"
      >
        <p className={styles.confirmText}>
          {concertToDelete
            ? `“${concertToDelete.title}” tas bort för alla körer, tillsammans med anmälningarna.`
            : "Giget tas bort."}
        </p>
        {deleteError && (
          <p className={styles.error} role="alert">
            {deleteError}
          </p>
        )}
        <Cluster justify="end" gap="sm">
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            size={ButtonSize.Small}
            disabled={isDeleting}
            onClick={() => {
              setConcertToDelete(null);
              setDeleteError(null);
            }}
          >
            Avbryt
          </Button>
          <Button
            type="button"
            variant={ButtonVariant.Primary}
            size={ButtonSize.Small}
            disabled={isDeleting}
            onClick={() => void confirmDelete()}
          >
            {isDeleting ? "Tar bort…" : "Ta bort"}
          </Button>
        </Cluster>
      </Modal>
    </div>
  );
};
