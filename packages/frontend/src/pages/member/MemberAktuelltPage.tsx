import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Modal } from "@/components/ui/modal/Modal";
import { Button, ButtonSize, ButtonVariant } from "@/components/ui/button/Button";
import {
  listMessages,
  markMessageRead,
  type FeedMessage,
} from "@/services/messageService";
import { useMessageUnread } from "@/hooks/useMessageUnread";
import {
  formatMessageListTime,
  formatMessageSenderFirstName,
} from "@/utils/messagePreview";
import styles from "./MemberAktuelltPage.module.scss";

const PAGE_SIZE = 20;

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

export const MemberAktuelltPage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FeedMessage | null>(null);
  const { unreadStatus, refetchUnread, decrementUnreadOptimistic } =
    useMessageUnread();

  const fetchMessages = useCallback(async () => {
    if (!groupName) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await listMessages(groupName, { limit: PAGE_SIZE });
      setMessages(data.messages);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error("Failed to load Aktuellt", err);
      setError("Kunde inte ladda Aktuellt.");
    } finally {
      setIsLoading(false);
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
                onOpen={openMessage}
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
                onOpen={openMessage}
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
            <p className={styles.modalContent}>{selected.body}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

function MessageRow({
  message,
  onOpen,
}: {
  message: FeedMessage;
  onOpen: (message: FeedMessage) => void;
}) {
  const sender = formatMessageSenderFirstName(
    message.createdByGivenName,
    message.createdByName
  );
  const timeLabel = formatMessageListTime(message.createdAt);

  return (
    <li>
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
    </li>
  );
}
