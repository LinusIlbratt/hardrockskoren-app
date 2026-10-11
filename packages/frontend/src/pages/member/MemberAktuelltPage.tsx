import { useState } from "react";
import { useParams } from "react-router-dom";
import { Info } from "lucide-react";
import { FiEdit } from "react-icons/fi";
import { IoTrashOutline } from "react-icons/io5";
import { LinkifiedText } from "@/components/ui/LinkifiedText";
import { Button, ButtonSize, ButtonVariant } from "@/components/ui/button/Button";
import { FormGroup } from "@/components/ui/form/FormGroup";
import { Input } from "@/components/ui/input/Input";
import { Cluster } from "@/components/ui/layout/Cluster";
import { Stack } from "@/components/ui/layout/Stack";
import { Modal } from "@/components/ui/modal/Modal";
import { Textarea } from "@/components/ui/textarea/Textarea";
import { useMemberFeed } from "@/features/messages/hooks/useMemberFeed";
import type { FeedMessage } from "@/services/messageService";
import {
  formatMessageListTime,
  formatMessageSenderFirstName,
} from "@/utils/messagePreview";
import styles from "./MemberAktuelltPage.module.scss";

function sortNewestFirst(a: FeedMessage, b: FeedMessage): number {
  const cmp = (b.createdAt || "").localeCompare(a.createdAt || "");
  if (cmp !== 0) return cmp;
  return (b.messageId || "").localeCompare(a.messageId || "");
}

export const MemberAktuelltPage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const feed = useMemberFeed(groupName);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  if (!groupName) {
    return null;
  }

  const unread = feed.messages.filter((message) => !message.isRead).sort(sortNewestFirst);
  const earlier = feed.messages.filter((message) => message.isRead).sort(sortNewestFirst);
  const unreadHint =
    feed.unreadStatus.unreadCount > unread.length ? " · fler olästa längre ner" : "";

  return (
    <Stack gap="lg" className={styles.page}>
      <Cluster align="start" gap="xs" className={styles.stickyHeader}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Aktuellt</h1>
          <button
            type="button"
            className={styles.infoButton}
            onClick={() => setIsHelpOpen(true)}
            aria-label="Så fungerar det"
            aria-expanded={isHelpOpen}
          >
            <Info size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {unread.length > 0 && (
          <p className={styles.subtitle}>
            {`${unread.length} olästa${unreadHint}`}
          </p>
        )}
        {feed.canCreate && (
          <Button
            type="button"
            variant={ButtonVariant.Primary}
            size={ButtonSize.Default}
            className={styles.createButton}
            onClick={feed.openCreate}
          >
            Nytt meddelande
          </Button>
        )}
      </Cluster>

      {feed.isLoading && <p className={styles.muted}>Laddar…</p>}
      {feed.error && <p className={styles.error}>{feed.error}</p>}

      {!feed.isLoading && !feed.error && feed.messages.length === 0 && (
        <p className={styles.muted}>Inga meddelanden just nu.</p>
      )}

      {unread.length > 0 && (
        <section aria-labelledby="aktuellt-olasta">
          <Stack gap="sm">
            <h2 id="aktuellt-olasta" className={styles.sectionTitle}>
              Olästa
            </h2>
            <ul className={styles.list}>
              {unread.map((message) => (
                <MessageRow
                  key={message.messageId}
                  message={message}
                  canManage={feed.canManage(message)}
                  onOpen={feed.openMessage}
                  onEdit={feed.openEdit}
                  onDelete={feed.requestDelete}
                />
              ))}
            </ul>
          </Stack>
        </section>
      )}

      {earlier.length > 0 && (
        <section aria-labelledby="aktuellt-tidigare">
          <Stack gap="sm">
            <h2 id="aktuellt-tidigare" className={styles.sectionTitle}>
              Tidigare
            </h2>
            <ul className={styles.list}>
              {earlier.map((message) => (
                <MessageRow
                  key={message.messageId}
                  message={message}
                  canManage={feed.canManage(message)}
                  onOpen={feed.openMessage}
                  onEdit={feed.openEdit}
                  onDelete={feed.requestDelete}
                />
              ))}
            </ul>
          </Stack>
        </section>
      )}

      {feed.hasMore && (
        <Cluster justify="center" className={styles.loadMore}>
          <Button
            type="button"
            variant={ButtonVariant.Ghost}
            size={ButtonSize.Small}
            disabled={feed.isLoadingMore}
            onClick={() => {
              void feed.loadOlder();
            }}
          >
            {feed.isLoadingMore ? "Laddar…" : "Ladda äldre meddelanden"}
          </Button>
        </Cluster>
      )}

      <Modal
        isOpen={!!feed.selected}
        onClose={() => feed.setSelected(null)}
        title={feed.selected?.title ?? "Meddelande"}
      >
        {feed.selected && (
          <Stack gap="md">
            <Cluster as="p" gap="sm" className={styles.modalMeta}>
              <span>
                {formatMessageSenderFirstName(
                  feed.selected.createdByGivenName,
                  feed.selected.createdByName
                )}
              </span>
              <time dateTime={feed.selected.createdAt}>
                {new Date(feed.selected.createdAt).toLocaleString("sv-SE")}
              </time>
            </Cluster>
            <p className={styles.modalContent}>
              <LinkifiedText text={feed.selected.body} />
            </p>
          </Stack>
        )}
      </Modal>

      <Modal
        isOpen={feed.composerMode !== null}
        onClose={feed.closeComposer}
        title={feed.composerMode === "edit" ? "Redigera meddelande" : "Nytt meddelande"}
        formMode
        footer={
          <Cluster justify="end" gap="sm">
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              size={ButtonSize.Small}
              disabled={feed.isSaving}
              onClick={feed.closeComposer}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Primary}
              size={ButtonSize.Small}
              isLoading={feed.isSaving}
              onClick={() => {
                void feed.submitComposer();
              }}
            >
              {feed.composerMode === "edit" ? "Spara" : "Publicera"}
            </Button>
          </Cluster>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void feed.submitComposer();
          }}
        >
          <Stack gap="md">
            <FormGroup label="Rubrik" htmlFor="aktuellt-title">
              <Input
                id="aktuellt-title"
                value={feed.draftTitle}
                maxLength={feed.titleMax}
                disabled={feed.isSaving}
                onChange={(event) => feed.setDraftTitle(event.target.value)}
              />
            </FormGroup>
            <FormGroup label="Meddelande" htmlFor="aktuellt-body">
              <Textarea
                id="aktuellt-body"
                className={styles.composerField}
                value={feed.draftBody}
                maxLength={feed.bodyMax}
                disabled={feed.isSaving}
                onChange={(event) => feed.setDraftBody(event.target.value)}
              />
            </FormGroup>
            {feed.formError && <p className={styles.error}>{feed.formError}</p>}
          </Stack>
        </form>
      </Modal>

      <Modal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="Så fungerar det"
        tone="luxury"
        size="compact"
      >
        <p className={styles.helpText}>
          Tryck på ett meddelande i listan för att läsa hela inlägget.
        </p>
      </Modal>

      <Modal
        isOpen={!!feed.pendingDelete}
        onClose={feed.cancelDelete}
        title="Ta bort meddelande"
        footer={
          <Cluster justify="end" gap="sm">
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              size={ButtonSize.Small}
              disabled={feed.isDeleting}
              onClick={feed.cancelDelete}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Destructive}
              size={ButtonSize.Small}
              isLoading={feed.isDeleting}
              onClick={() => {
                void feed.confirmDelete();
              }}
            >
              Ta bort
            </Button>
          </Cluster>
        }
      >
        <Stack gap="md">
          <p className={styles.confirmText}>
            Är du säker på att du vill ta bort detta meddelande?
          </p>
          {feed.deleteError && <p className={styles.error}>{feed.deleteError}</p>}
        </Stack>
      </Modal>
    </Stack>
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
    <li className={`${styles.newsCard} ${message.isRead ? styles.read : styles.unread}`}>
      <div
        className={styles.newsContent}
        onClick={() => onOpen(message)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
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
        <h3 className={styles.newsTitle}>
          {!message.isRead && <span className={styles.dot} aria-hidden="true" />}
          <span>{message.title}</span>
        </h3>
        <div className={styles.newsMeta}>
          <span>{sender}</span>
          <span className={styles.metaDot} aria-hidden="true">•</span>
          <time dateTime={message.createdAt}>{timeLabel}</time>
        </div>
      </div>
      {canManage && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionButton}
            title="Redigera meddelande"
            aria-label={`Redigera ${message.title}`}
            onClick={() => onEdit(message)}
          >
            <FiEdit size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.deleteButton}
            title="Ta bort meddelande"
            aria-label={`Ta bort ${message.title}`}
            onClick={() => onDelete(message)}
          >
            <IoTrashOutline size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </li>
  );
}
