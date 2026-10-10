import { useState } from "react";
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

type MessageTab = "compose" | "sent";

export const AdminMessagePage = () => {
  const [tab, setTab] = useState<MessageTab>("compose");

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
  } = useMessageComposer({
    fetchSent,
    onCreated: () => setTab("sent"),
  });

  const editingIsAll = Boolean(
    editing && (editing.scope === "all" || editing.targets.includes("ALL"))
  );

  const handleSaveEdit = async () => {
    const saved = await submitEdit();
    if (saved) setTab("sent");
  };

  const handleEdit = (message: SentMessage) => {
    openEdit(message);
    setTab("compose");
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Meddelande</h1>

      <div className={styles.segment} role="tablist" aria-label="Meddelandevy">
        <button
          type="button"
          role="tab"
          id="message-tab-compose"
          aria-selected={tab === "compose"}
          aria-controls="message-panel-compose"
          className={styles.segmentButton}
          onClick={() => setTab("compose")}
        >
          Skriv nytt
        </button>
        <button
          type="button"
          role="tab"
          id="message-tab-sent"
          aria-selected={tab === "sent"}
          aria-controls="message-panel-sent"
          className={styles.segmentButton}
          onClick={() => setTab("sent")}
        >
          Skickade ({sentMessages.length})
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

      {tab === "compose" && (
      <div
        role="tabpanel"
        id="message-panel-compose"
        aria-labelledby="message-tab-compose"
        className={styles.panel}
      >
      {editing && (
        <p className={styles.subtitle}>
          Du redigerar ett skickat meddelande. Mottagarna behålls.
        </p>
      )}

      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          if (editing) {
            event.preventDefault();
            void handleSaveEdit();
            return;
          }
          void handleSubmit(event);
        }}
      >
        <fieldset className={styles.audienceFieldset}>
          <legend className={styles.audienceLegend}>Mottagare</legend>
          <Cluster gap="md" role="radiogroup" aria-label="Mottagare">
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="audience-mode"
                value="all"
                checked={editing ? editingIsAll : audienceMode === "all"}
                onChange={() => setAudienceMode("all")}
                disabled={isSubmitting || isSavingEdit || Boolean(editing)}
              />
              Alla körer
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="audience-mode"
                value="selected"
                checked={editing ? !editingIsAll : audienceMode === "selected"}
                onChange={() => setAudienceMode("selected")}
                disabled={isSubmitting || isSavingEdit || Boolean(editing)}
              />
              Valda körer
            </label>
          </Cluster>
        </fieldset>

        {editing && !editingIsAll && (
          <p className={styles.hint}>
            Till: {formatTargetsLabel(editing, groupsBySlug)}
          </p>
        )}

        {!editing && audienceMode === "selected" && (
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
            value={editing ? draftTitle : title}
            onChange={(e) =>
              editing ? setDraftTitle(e.target.value) : setTitle(e.target.value)
            }
            maxLength={TITLE_MAX}
            required
            placeholder="Kort rubrik"
            disabled={isSubmitting || isSavingEdit}
          />
        </FormGroup>

        <FormGroup label="Meddelande" htmlFor="message-body">
          <Textarea
            id="message-body"
            value={editing ? draftBody : body}
            onChange={(e) =>
              editing ? setDraftBody(e.target.value) : setBody(e.target.value)
            }
            maxLength={BODY_MAX}
            required
            rows={8}
            placeholder="Skriv ditt meddelande…"
            disabled={isSubmitting || isSavingEdit}
          />
        </FormGroup>

        {formError && <p className={styles.error}>{formError}</p>}

        {editing ? (
          <div className={styles.editActions}>
            <Button
              type="submit"
              className={styles.submitButton}
              variant={ButtonVariant.Primary}
              isLoading={isSavingEdit}
            >
              {isSavingEdit ? "Sparar…" : "Spara ändringar"}
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              disabled={isSavingEdit}
              onClick={closeEdit}
            >
              Avbryt
            </Button>
          </div>
        ) : (
          <Button
            type="submit"
            className={styles.submitButton}
            variant={ButtonVariant.Primary}
            disabled={selectedModeDisabled}
          >
            {isSubmitting ? "Skickar…" : "Skicka meddelande"}
          </Button>
        )}
      </form>
      </div>
      )}

      {tab === "sent" && (
      <section
        className={styles.history}
        role="tabpanel"
        id="message-panel-sent"
        aria-labelledby="message-tab-sent"
      >
        <p className={styles.historySubtitle}>
          {sentMessages.length > 0
            ? "Tryck på ett meddelande för att läsa det."
            : "Här visas meddelanden du har skickat."}
        </p>

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
                  onClick={() => handleEdit(msg)}
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
      )}

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
