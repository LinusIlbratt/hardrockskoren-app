import { FiEdit } from "react-icons/fi";
import { IoTrashOutline } from "react-icons/io5";
import {
  Button,
  ButtonSize,
  ButtonVariant,
} from "@/components/ui/button/Button";
import { FormGroup } from "@/components/ui/form/FormGroup";
import { Input } from "@/components/ui/input/Input";
import { Textarea } from "@/components/ui/textarea/Textarea";
import { LinkifiedText } from "@/components/ui/LinkifiedText";
import { Cluster } from "@/components/ui/layout/Cluster";
import { Modal } from "@/components/ui/modal/Modal";
import { StyledSelect } from "@/components/ui/select/StyledSelect";
import type { SentMessage } from "@/services/messageService";
import {
  formatMessageListTime,
  formatMessageSender,
} from "@/utils/messagePreview";
import {
  BODY_MAX,
  TITLE_MAX,
  useMessageComposer,
  useMessageHistory,
} from "@/features/messages";
import styles from "./AdminMessagePage.module.scss";

function formatTargetsLabel(
  message: SentMessage,
  groupsBySlug: Map<string, string>
): string {
  if (message.scope === "all" || message.targets.includes("ALL")) {
    return "Alla körer";
  }
  return message.targets
    .map((slug) => groupsBySlug.get(slug) ?? slug)
    .join(", ");
}

/** Compact list label: avoid wrapping long multi-choir strings. */
function formatTargetsShort(
  message: SentMessage,
  groupsBySlug: Map<string, string>
): string {
  if (message.scope === "all" || message.targets.includes("ALL")) {
    return "Alla körer";
  }
  const names = message.targets.map(
    (slug) => groupsBySlug.get(slug) ?? slug
  );
  if (names.length <= 1) return names[0] ?? "—";
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]} +${names.length - 1}`;
}

export const AdminMessagePage = () => {
  const {
    sentMessages,
    sentHasMore,
    sentError,
    isLoadingSent,
    isLoadingMoreSent,
    selectedSent,
    setSelectedSent,
    editing,
    draftTitle,
    setDraftTitle,
    draftBody,
    setDraftBody,
    formError,
    isSavingEdit,
    pendingDelete,
    setPendingDelete,
    isDeleting,
    deleteError,
    setDeleteError,
    loadOlderSent,
    openEdit,
    closeEdit,
    submitEdit,
    confirmDelete,
    fetchSent,
  } = useMessageHistory();

  const {
    groups,
    groupsError,
    isLoadingGroups,
    groupOptions,
    groupsBySlug,
    title,
    setTitle,
    body,
    setBody,
    audienceMode,
    setAudienceMode,
    selectedGroups,
    setSelectedGroups,
    isSubmitting,
    statusMessage,
    handleSubmit,
    selectedModeDisabled,
  } = useMessageComposer({ fetchSent });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Meddelande</h1>
      <p className={styles.subtitle}>
        Skriv ett meddelande till alla körer eller till en eller flera specifika
        körer. Medlemmar ser det under fliken Aktuellt.
      </p>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <fieldset className={styles.audienceFieldset}>
          <legend className={styles.audienceLegend}>Mottagare</legend>
          <Cluster gap="md" role="radiogroup" aria-label="Mottagare">
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="audience-mode"
                value="all"
                checked={audienceMode === "all"}
                onChange={() => setAudienceMode("all")}
                disabled={isSubmitting}
              />
              Alla körer
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="audience-mode"
                value="selected"
                checked={audienceMode === "selected"}
                onChange={() => setAudienceMode("selected")}
                disabled={isSubmitting}
              />
              Valda körer
            </label>
          </Cluster>
        </fieldset>

        {audienceMode === "selected" && (
          <FormGroup
            label="Körer"
            htmlFor="message-targets"
            error={groupsError && groups.length === 0 ? groupsError : null}
          >
            <StyledSelect
              inputId="message-targets"
              isMulti
              options={groupOptions}
              value={selectedGroups}
              onChange={(opts) => setSelectedGroups(opts ? [...opts] : [])}
              placeholder={
                isLoadingGroups ? "Laddar körer…" : "Välj en eller flera körer…"
              }
              isDisabled={
                isSubmitting || isLoadingGroups || groupOptions.length === 0
              }
              isLoading={isLoadingGroups}
              closeMenuOnSelect={false}
              noOptionsMessage={() => "Inga körer att välja"}
            />
            {groups.length > 0 && selectedGroups.length === groups.length && (
              <p className={styles.hint}>
                Alla körer är valda — meddelandet skickas som ett gemensamt
                meddelande till alla (samma som &quot;Alla körer&quot;).
              </p>
            )}
          </FormGroup>
        )}

        <FormGroup label="Rubrik" htmlFor="message-title">
          <Input
            id="message-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            required
            placeholder="Kort rubrik"
            disabled={isSubmitting}
          />
        </FormGroup>

        <FormGroup label="Meddelande" htmlFor="message-body">
          <Textarea
            id="message-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            required
            rows={8}
            placeholder="Skriv ditt meddelande…"
            disabled={isSubmitting}
          />
        </FormGroup>

        <Button
          type="submit"
          variant={ButtonVariant.Primary}
          disabled={selectedModeDisabled}
        >
          {isSubmitting ? "Skickar…" : "Skicka meddelande"}
        </Button>
      </form>

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

      <section className={styles.history} aria-labelledby="sent-history-heading">
        <header className={styles.historySticky}>
          <h2 id="sent-history-heading" className={styles.historyTitle}>
            Skickade meddelanden
          </h2>
          <p className={styles.historySubtitle}>
            {sentMessages.length > 0
              ? `${sentMessages.length} utskick · tryck för att läsa`
              : "Klicka för att läsa hela meddelandet"}
          </p>
        </header>

        {isLoadingSent && <p className={styles.muted}>Laddar historik…</p>}
        {sentError && <p className={styles.error}>{sentError}</p>}
        {!isLoadingSent && !sentError && sentMessages.length === 0 && (
          <p className={styles.muted}>Inga skickade meddelanden ännu.</p>
        )}

        <ul className={styles.historyList}>
          {sentMessages.map((msg) => (
            <li key={msg.messageId} className={styles.historyItem}>
              <button
                type="button"
                className={styles.historyRow}
                onClick={() => setSelectedSent(msg)}
                aria-label={`Öppna ${msg.title}`}
              >
                <div className={styles.historyRowMain}>
                  <h3 className={styles.historyItemTitle}>{msg.title}</h3>
                  <span className={styles.historyTargets}>
                    {formatTargetsShort(msg, groupsBySlug)}
                  </span>
                </div>
                <div className={styles.historyRowMeta}>
                  <span className={styles.historySender}>
                    {formatMessageSender(msg.createdByName)}
                  </span>
                  <time dateTime={msg.createdAt}>
                    {formatMessageListTime(msg.createdAt)}
                  </time>
                </div>
              </button>
              <div className={styles.historyActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  title="Redigera meddelande"
                  aria-label="Redigera meddelande"
                  onClick={() => openEdit(msg)}
                >
                  <FiEdit size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.deleteIcon}`}
                  title="Ta bort meddelande"
                  aria-label="Ta bort meddelande"
                  onClick={() => {
                    setDeleteError(null);
                    setPendingDelete(msg);
                  }}
                >
                  <IoTrashOutline size={17} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {sentHasMore && (
          <Cluster justify="center" className={styles.loadMore}>
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              size={ButtonSize.Small}
              disabled={isLoadingMoreSent}
              onClick={loadOlderSent}
            >
              {isLoadingMoreSent ? "Laddar…" : "Ladda äldre meddelanden"}
            </Button>
          </Cluster>
        )}
      </section>

      <Modal
        isOpen={!!selectedSent}
        onClose={() => setSelectedSent(null)}
        title={selectedSent?.title ?? "Meddelande"}
      >
        {selectedSent && (
          <div className={styles.modalBody}>
            <Cluster as="p" gap="sm" className={styles.modalMeta}>
              <span>{formatMessageSender(selectedSent.createdByName)}</span>
              <span>Till: {formatTargetsLabel(selectedSent, groupsBySlug)}</span>
              <time dateTime={selectedSent.createdAt}>
                {new Date(selectedSent.createdAt).toLocaleString("sv-SE")}
              </time>
            </Cluster>
            <p className={`${styles.modalContent} whitespace-pre-wrap`}>
              <LinkifiedText text={selectedSent.body} />
            </p>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!editing}
        onClose={closeEdit}
        title="Redigera meddelande"
        formMode
        footer={
          <Cluster justify="end" gap="sm">
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              size={ButtonSize.Small}
              disabled={isSavingEdit}
              onClick={closeEdit}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Primary}
              size={ButtonSize.Small}
              isLoading={isSavingEdit}
              onClick={() => {
                void submitEdit();
              }}
            >
              Spara
            </Button>
          </Cluster>
        }
      >
        <form
          className={styles.editForm}
          onSubmit={(event) => {
            event.preventDefault();
            void submitEdit();
          }}
        >
          <FormGroup label="Rubrik" htmlFor="edit-message-title">
            <Input
              id="edit-message-title"
              value={draftTitle}
              maxLength={TITLE_MAX}
              disabled={isSavingEdit}
              onChange={(event) => setDraftTitle(event.target.value)}
            />
          </FormGroup>
          <FormGroup label="Meddelande" htmlFor="edit-message-body">
            <Textarea
              id="edit-message-body"
              value={draftBody}
              maxLength={BODY_MAX}
              disabled={isSavingEdit}
              rows={8}
              onChange={(event) => setDraftBody(event.target.value)}
            />
          </FormGroup>
          {formError && <p className={styles.error}>{formError}</p>}
        </form>
      </Modal>

      <Modal
        isOpen={!!pendingDelete}
        onClose={() => {
          if (!isDeleting) {
            setPendingDelete(null);
            setDeleteError(null);
          }
        }}
        title="Ta bort meddelande"
        footer={
          <Cluster justify="end" gap="sm">
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              size={ButtonSize.Small}
              disabled={isDeleting}
              onClick={() => {
                setPendingDelete(null);
                setDeleteError(null);
              }}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Destructive}
              size={ButtonSize.Small}
              isLoading={isDeleting}
              onClick={() => {
                void confirmDelete();
              }}
            >
              Ta bort
            </Button>
          </Cluster>
        }
      >
        <div className={styles.modalBody}>
          <p className={styles.confirmText}>
            Är du säker på att du vill ta bort detta meddelande?
          </p>
          {deleteError && <p className={styles.error}>{deleteError}</p>}
        </div>
      </Modal>
    </div>
  );
};
