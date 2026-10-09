import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  deleteMessage,
  listSentMessages,
  updateMessage,
  type SentMessage,
} from "@/services/messageService";
import { extractMessageError } from "@/features/messages/messageAdminError";
import { validateDraft } from "@/features/messages/useMessageComposer";

const HISTORY_PAGE_SIZE = 20;

export function useMessageHistory() {
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  const [sentHasMore, setSentHasMore] = useState(false);
  const [sentError, setSentError] = useState<string | null>(null);
  const [isLoadingSent, setIsLoadingSent] = useState(true);
  const [isLoadingMoreSent, setIsLoadingMoreSent] = useState(false);
  const [selectedSent, setSelectedSent] = useState<SentMessage | null>(null);
  const [editing, setEditing] = useState<SentMessage | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SentMessage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchSent = useCallback(async () => {
    setIsLoadingSent(true);
    setSentError(null);
    try {
      const result = await listSentMessages({ limit: HISTORY_PAGE_SIZE });
      setSentMessages(result.messages);
      setSentHasMore(result.hasMore);
    } catch (error) {
      console.error("Failed to fetch sent messages", error);
      setSentMessages([]);
      setSentHasMore(false);
      setSentError(
        axios.isAxiosError(error) && error.response?.status === 403
          ? "Du har inte behörighet att se skickade meddelanden."
          : "Kunde inte hämta skickade meddelanden."
      );
    } finally {
      setIsLoadingSent(false);
    }
  }, []);

  const loadOlderSent = async () => {
    if (isLoadingMoreSent || !sentHasMore || sentMessages.length === 0) return;
    const oldest = sentMessages[sentMessages.length - 1];
    const before = `${oldest.createdAt}#${oldest.messageId}`;
    setIsLoadingMoreSent(true);
    try {
      const result = await listSentMessages({
        limit: HISTORY_PAGE_SIZE,
        before,
      });
      setSentMessages((prev) => {
        const seen = new Set(prev.map((m) => m.messageId));
        const next = [...prev];
        for (const m of result.messages) {
          if (!seen.has(m.messageId)) next.push(m);
        }
        return next;
      });
      setSentHasMore(result.hasMore);
    } catch (error) {
      console.error("Failed to fetch older sent messages", error);
      setSentError("Kunde inte ladda äldre meddelanden.");
    } finally {
      setIsLoadingMoreSent(false);
    }
  };

  const openEdit = (message: SentMessage) => {
    setDraftTitle(message.title);
    setDraftBody(message.body);
    setFormError(null);
    setEditing(message);
  };

  const closeEdit = () => {
    if (isSavingEdit) return;
    setEditing(null);
    setFormError(null);
  };

  const submitEdit = async () => {
    if (!editing) return;
    const validationError = validateDraft(draftTitle, draftBody);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const draft = { title: draftTitle.trim(), body: draftBody.trim() };
    setIsSavingEdit(true);
    setFormError(null);
    try {
      const updated = await updateMessage(editing.messageId, draft);
      const nextTitle = updated.title || draft.title;
      const nextBody = updated.body || draft.body;
      setSentMessages((prev) =>
        prev.map((message) =>
          message.messageId === editing.messageId
            ? { ...message, title: nextTitle, body: nextBody }
            : message
        )
      );
      setSelectedSent((current) =>
        current && current.messageId === editing.messageId
          ? { ...current, title: nextTitle, body: nextBody }
          : current
      );
      setEditing(null);
    } catch (error) {
      console.error("Failed to update sent message", error);
      setFormError(
        extractMessageError(error, "Kunde inte spara meddelandet.")
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteMessage(pendingDelete.messageId);
      setSentMessages((prev) =>
        prev.filter((message) => message.messageId !== pendingDelete.messageId)
      );
      setSelectedSent((current) =>
        current?.messageId === pendingDelete.messageId ? null : current
      );
      setPendingDelete(null);
    } catch (error) {
      console.error("Failed to delete sent message", error);
      setDeleteError(
        extractMessageError(error, "Kunde inte ta bort meddelandet.")
      );
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    fetchSent();
  }, [fetchSent]);

  return {
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
  };
}
