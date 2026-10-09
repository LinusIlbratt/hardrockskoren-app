import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { FiEdit } from "react-icons/fi";
import { IoTrashOutline } from "react-icons/io5";
import { LinkifiedText } from "@/components/ui/LinkifiedText";
import { Modal } from "@/components/ui/modal/Modal";
import { FormGroup } from "@/components/ui/form/FormGroup";
import { Input } from "@/components/ui/input/Input";
import { Button, ButtonSize, ButtonVariant } from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import {
  createGroupMessage,
  deleteMessage,
  listMessages,
  markMessageRead,
  updateMessage,
  type FeedMessage,
} from "@/services/messageService";
import { useMessageUnread } from "@/hooks/useMessageUnread";
import {
  formatMessageListTime,
  formatMessageSenderFirstName,
} from "@/utils/messagePreview";
import styles from "./MemberAktuelltPage.module.scss";

const PAGE_SIZE = 20;
const TITLE_MAX = 120;
const BODY_MAX = 4000;

type ComposerMode = "create" | "edit";

function sortNewestFirst(a: FeedMessage, b: FeedMessage): number {
  const cmp = (b.createdAt || "").localeCompare(a.createdAt || "");
  if (cmp !== 0) return cmp;
  return (b.messageId || "").localeCompare(a.messageId || "");
}

function mergeById(
  existing: FeedMessage[],
  incoming: FeedMessage[]
): FeedMessage[] {
  const map = new Map<string, FeedMessage>();
  for (const m of existing) map.set(m.messageId, m);
  for (const m of incoming) map.set(m.messageId, m);
  return Array.from(map.values()).sort(sortNewestFirst);
}

function oldestCursor(messages: FeedMessage[]): string | null {
  if (messages.length === 0) return null;
  const oldest = [...messages].sort(sortNewestFirst).at(-1);
  if (!oldest) return null;
  return `${oldest.createdAt}#${oldest.messageId}`;
}

function callerUuid(user: { uuid?: string } | null): string {
  return typeof user?.uuid === "string" ? user.uuid.trim() : "";
}

function canManageMessage(
  role: string | undefined,
  uuid: string,
  message: FeedMessage
): boolean {
  if (role === "admin") return true;
  if (role !== "leader") return false;
  const owner = message.createdByUuid?.trim() ?? "";
  return owner.length > 0 && owner === uuid;
}

function validateDraft(title: string, body: string): string | null {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle || !trimmedBody) {
    return "Fyll i både rubrik och meddelande.";
  }
  if (trimmedTitle.length > TITLE_MAX) {
    return `Rubriken får vara högst ${TITLE_MAX} tecken.`;
  }
  if (trimmedBody.length > BODY_MAX) {
    return `Texten får vara högst ${BODY_MAX} tecken.`;
  }
  return null;
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
    if (!error.response) {
      return "Kunde inte nå meddelandetjänsten. Kontrollera nätverk och API-URL.";
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}

export const MemberAktuelltPage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FeedMessage | null>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FeedMessage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { unreadStatus, refetchUnread, decrementUnreadOptimistic } =
    useMessageUnread();

  const uuid = callerUuid(user);
  const canCreate = user?.role === "admin" || user?.role === "leader";

  const fetchMessages = useCallback(async (silent = false) => {
    if (!groupName) return;
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const data = await listMessages(groupName, { limit: PAGE_SIZE });
      setMessages(data.messages);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error("Failed to load Aktuellt", err);
      setError("Kunde inte ladda Aktuellt.");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [groupName]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const loadOlder = async () => {
    if (!groupName || isLoadingMore || !hasMore) return;
    const before = oldestCursor(messages);
    if (!before) return;

    setIsLoadingMore(true);
    try {
      const data = await listMessages(groupName, {
        limit: PAGE_SIZE,
        before,
      });
      setMessages((prev) => mergeById(prev, data.messages));
      setHasMore(data.hasMore);
    } catch (err) {
      console.error("Failed to load older Aktuellt", err);
      setError("Kunde inte ladda äldre meddelanden.");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const openMessage = async (message: FeedMessage) => {
    setSelected(message);
    if (message.isRead) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.messageId === message.messageId ? { ...m, isRead: true } : m
      )
    );
    decrementUnreadOptimistic();
    try {
      await markMessageRead(message.messageId);
      await refetchUnread();
    } catch (err) {
      console.error("Failed to mark message read", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.messageId === message.messageId ? { ...m, isRead: false } : m
        )
      );
      await refetchUnread();
    }
  };

  const closeComposer = () => {
    if (isSaving) return;
    setComposerMode(null);
    setEditingId(null);
    setFormError(null);
  };

  const openCreate = () => {
    setDraftTitle("");
    setDraftBody("");
    setFormError(null);
    setEditingId(null);
    setComposerMode("create");
  };

  const openEdit = (message: FeedMessage) => {
    setDraftTitle(message.title);
    setDraftBody(message.body);
    setFormError(null);
    setEditingId(message.messageId);
    setComposerMode("edit");
  };

  const submitComposer = async () => {
    if (!groupName || !composerMode) return;
    const validationError = validateDraft(draftTitle, draftBody);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const draft = { title: draftTitle.trim(), body: draftBody.trim() };
    setIsSaving(true);
    setFormError(null);
    try {
      if (composerMode === "create") {
        await createGroupMessage(groupName, draft);
      } else if (editingId) {
        const updated = await updateMessage(editingId, draft);
        setSelected((current) =>
          current && current.messageId === editingId
            ? {
                ...current,
                title: updated.title || draft.title,
                body: updated.body || draft.body,
                updatedAt: updated.updatedAt,
              }
            : current
        );
      }
      setComposerMode(null);
      setEditingId(null);
      await fetchMessages(true);
    } catch (err) {
      console.error("Failed to save Aktuellt message", err);
      setFormError(
        extractApiErrorMessage(
          err,
          composerMode === "create"
            ? "Kunde inte publicera meddelandet."
            : "Kunde inte spara meddelandet."
        )
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteMessage(pendingDelete.messageId);
      if (selected?.messageId === pendingDelete.messageId) {
        setSelected(null);
      }
      setPendingDelete(null);
      await fetchMessages(true);
      await refetchUnread();
    } catch (err) {
      console.error("Failed to delete Aktuellt message", err);
      setDeleteError(
        extractApiErrorMessage(err, "Kunde inte ta bort meddelandet.")
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (!groupName) {
    return null;
  }

  const unread = messages.filter((m) => !m.isRead).sort(sortNewestFirst);
  const earlier = messages.filter((m) => m.isRead).sort(sortNewestFirst);
  const unreadHint =
    unreadStatus.unreadCount > unread.length
      ? " · fler olästa längre ner"
      : "";

  return (
    <div className={styles.page}>
      <header className={styles.stickyHeader}>
        <h1 className={styles.title}>Aktuellt</h1>
        <p className={styles.subtitle}>
          {unread.length > 0
            ? `${unread.length} olästa · tryck för att läsa${unreadHint}`
            : "Tryck för att läsa hela meddelandet"}
        </p>
        {canCreate && (
          <Button
            type="button"
            variant={ButtonVariant.Primary}
            size={ButtonSize.Default}
            className={styles.createButton}
            onClick={openCreate}
          >
            Nytt meddelande
          </Button>
        )}
      </header>

      {isLoading && <p className={styles.muted}>Laddar…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!isLoading && !error && messages.length === 0 && (
        <p className={styles.muted}>Inga meddelanden just nu.</p>
      )}

      {unread.length > 0 && (
        <section className={styles.section} aria-labelledby="aktuellt-olasta">
          <h2 id="aktuellt-olasta" className={styles.sectionTitle}>
            Olästa
          </h2>
          <ul className={styles.list}>
            {unread.map((message) => (
              <MessageRow
                key={message.messageId}
                message={message}
                canManage={canManageMessage(user?.role, uuid, message)}
                onOpen={openMessage}
                onEdit={openEdit}
                onDelete={(item) => {
                  setDeleteError(null);
                  setPendingDelete(item);
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {earlier.length > 0 && (
        <section className={styles.section} aria-labelledby="aktuellt-tidigare">
          <h2 id="aktuellt-tidigare" className={styles.sectionTitle}>
            Tidigare
          </h2>
          <ul className={styles.list}>
            {earlier.map((message) => (
              <MessageRow
                key={message.messageId}
                message={message}
                canManage={canManageMessage(user?.role, uuid, message)}
                onOpen={openMessage}
                onEdit={openEdit}
                onDelete={(item) => {
                  setDeleteError(null);
                  setPendingDelete(item);
                }}
              />
            ))}
          </ul>
        </section>
      )}

      {hasMore && (
        <div className={styles.loadMore}>
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            size={ButtonSize.Small}
            disabled={isLoadingMore}
            onClick={loadOlder}
          >
            {isLoadingMore ? "Laddar…" : "Ladda äldre meddelanden"}
          </Button>
        </div>
      )}

      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Meddelande"}
      >
        {selected && (
          <div className={styles.modalBody}>
            <p className={styles.modalMeta}>
              <span>
                {formatMessageSenderFirstName(
                  selected.createdByGivenName,
                  selected.createdByName
                )}
              </span>
              <time dateTime={selected.createdAt}>
                {new Date(selected.createdAt).toLocaleString("sv-SE")}
              </time>
            </p>
            <p className={`${styles.modalContent} whitespace-pre-wrap`}>
              <LinkifiedText text={selected.body} />
            </p>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={composerMode !== null}
        onClose={closeComposer}
        title={composerMode === "edit" ? "Redigera meddelande" : "Nytt meddelande"}
        formMode
        footer={
          <div className={styles.formActions}>
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              size={ButtonSize.Small}
              disabled={isSaving}
              onClick={closeComposer}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Primary}
              size={ButtonSize.Small}
              isLoading={isSaving}
              onClick={submitComposer}
            >
              {composerMode === "edit" ? "Spara" : "Publicera"}
            </Button>
          </div>
        }
      >
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void submitComposer();
          }}
        >
          <FormGroup label="Rubrik" htmlFor="aktuellt-title">
            <Input
              id="aktuellt-title"
              value={draftTitle}
              maxLength={TITLE_MAX}
              disabled={isSaving}
              onChange={(event) => setDraftTitle(event.target.value)}
            />
          </FormGroup>
          <FormGroup label="Meddelande" htmlFor="aktuellt-body">
            <textarea
              id="aktuellt-body"
              className={styles.textarea}
              value={draftBody}
              maxLength={BODY_MAX}
              disabled={isSaving}
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
          <div className={styles.formActions}>
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
          </div>
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

function MessageRow({
  message,
  canManage,
  onOpen,
  onEdit,
  onDelete,
}: {
  message: FeedMessage;
  canManage: boolean;
  onOpen: (message: FeedMessage) => void;
  onEdit: (message: FeedMessage) => void;
  onDelete: (message: FeedMessage) => void;
}) {
  const sender = formatMessageSenderFirstName(
    message.createdByGivenName,
    message.createdByName
  );
  const timeLabel = formatMessageListTime(message.createdAt);

  return (
    <li className={styles.item}>
      <article
        className={`${styles.row} ${message.isRead ? styles.read : styles.unread}`}
        onClick={() => onOpen(message)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(message);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={
          message.isRead
            ? `Öppna ${message.title}`
            : `Öppna ${message.title} (oläst)`
        }
      >
        <div className={styles.rowMain}>
          {!message.isRead && (
            <span className={styles.dot} aria-hidden="true" />
          )}
          <h3 className={styles.rowTitle}>{message.title}</h3>
        </div>
        <div className={styles.rowMeta}>
          <span className={styles.sender}>{sender}</span>
          <time dateTime={message.createdAt}>{timeLabel}</time>
        </div>
      </article>
      {canManage && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            title="Redigera meddelande"
            aria-label="Redigera meddelande"
            onClick={() => onEdit(message)}
          >
            <FiEdit size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.deleteIcon}`}
            title="Ta bort meddelande"
            aria-label="Ta bort meddelande"
            onClick={() => onDelete(message)}
          >
            <IoTrashOutline size={17} aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}
