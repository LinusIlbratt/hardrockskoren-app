import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  listMessages,
  markMessageRead,
  type FeedMessage,
} from "@/services/messageService";
import { useMessageUnread } from "@/hooks/useMessageUnread";
import styles from "./MemberAktuelltPage.module.scss";

export const MemberAktuelltPage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { refetchUnread } = useMessageUnread(groupName);

  const fetchMessages = useCallback(async () => {
    if (!groupName) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await listMessages(groupName);
      setMessages(data);
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

  const handleMarkRead = async (message: FeedMessage) => {
    if (message.isRead) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.messageId === message.messageId ? { ...m, isRead: true } : m
      )
    );
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
    }
  };

  if (!groupName) {
    return null;
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Aktuellt</h1>
      <p className={styles.subtitle}>
        Meddelanden från admin. Nyast överst.
      </p>

      {isLoading && <p className={styles.muted}>Laddar…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!isLoading && !error && messages.length === 0 && (
        <p className={styles.muted}>Inga meddelanden just nu.</p>
      )}

      <ul className={styles.list}>
        {messages.map((message) => (
          <li key={message.messageId}>
            <article
              className={`${styles.card} ${message.isRead ? styles.read : styles.unread}`}
              onClick={() => handleMarkRead(message)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleMarkRead(message);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={
                message.isRead
                  ? message.title
                  : `${message.title} (oläst)`
              }
            >
              <header className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  {!message.isRead && (
                    <span className={styles.dot} aria-hidden="true" />
                  )}
                  {message.title}
                </h2>
                <div className={styles.meta}>
                  {message.scope === "all" && (
                    <span className={styles.scope}>Alla körer</span>
                  )}
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleString("sv-SE")}
                  </time>
                </div>
              </header>
              <p className={styles.body}>{message.body}</p>
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
};
