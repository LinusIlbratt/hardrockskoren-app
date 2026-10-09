import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useMessageUnread } from "@/hooks/useMessageUnread";
import {
  BODY_MAX,
  TITLE_MAX,
  validateDraft,
} from "@/features/messages/useMessageComposer";
import {
  createGroupMessage,
  deleteMessage,
  listMessages,
  markMessageRead,
  updateMessage,
  type FeedMessage,
} from "@/services/messageService";
import { getApiErrorMessage, isAbortError } from "@/utils/apiError";

const PAGE_SIZE = 20;

export type ComposerMode = "create" | "edit";

function sortNewestFirst(a: FeedMessage, b: FeedMessage): number {
  const cmp = (b.createdAt || "").localeCompare(a.createdAt || "");
  if (cmp !== 0) return cmp;
  return (b.messageId || "").localeCompare(a.messageId || "");
}

function mergeById(existing: FeedMessage[], incoming: FeedMessage[]): FeedMessage[] {
  const map = new Map<string, FeedMessage>();
  for (const message of existing) map.set(message.messageId, message);
  for (const message of incoming) map.set(message.messageId, message);
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

export function useMemberFeed(groupSlug: string | undefined) {
  const { user } = useAuth();
  const { unreadStatus, refetchUnread, decrementUnreadOptimistic } = useMessageUnread();

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

  const slugRef = useRef(groupSlug);
  slugRef.current = groupSlug;
  const messagesRef = useRef<FeedMessage[]>([]);
  const hasMoreRef = useRef(false);
  const fetchGenRef = useRef(0);
  const moreGenRef = useRef(0);
  const removedIdsRef = useRef(new Set<string>());

  const commitList = useCallback((next: FeedMessage[], more: boolean) => {
    messagesRef.current = next;
    hasMoreRef.current = more;
    setMessages(next);
    setHasMore(more);
  }, []);

  const visibleMessages = useCallback((incoming: FeedMessage[]) => {
    if (removedIdsRef.current.size === 0) return incoming;
    return incoming.filter((message) => !removedIdsRef.current.has(message.messageId));
  }, []);

  const refreshFirstPage = useCallback(async (mode: "replace" | "merge") => {
    const slug = groupSlug?.trim();
    if (!slug) return;
    const gen = ++fetchGenRef.current;
    if (mode === "replace") setIsLoading(true);
    setError(null);
    try {
      const data = await listMessages(slug, { limit: PAGE_SIZE });
      if (gen !== fetchGenRef.current || slugRef.current !== groupSlug) return;
      const incoming = visibleMessages(data.messages);
      if (mode === "replace") {
        commitList([...incoming].sort(sortNewestFirst), data.hasMore);
        return;
      }
      const prev = visibleMessages(messagesRef.current);
      const loadedBeyondFirstPage = prev.length > incoming.length;
      commitList(
        mergeById(prev, incoming),
        loadedBeyondFirstPage ? hasMoreRef.current : data.hasMore
      );
    } catch (err) {
      if (gen !== fetchGenRef.current || slugRef.current !== groupSlug || isAbortError(err)) return;
      setError(getApiErrorMessage(err, "Kunde inte ladda Aktuellt."));
    } finally {
      if (gen === fetchGenRef.current && slugRef.current === groupSlug && mode === "replace") {
        setIsLoading(false);
      }
    }
  }, [commitList, groupSlug, visibleMessages]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const slug = groupSlug?.trim();
    const gen = ++fetchGenRef.current;
    removedIdsRef.current = new Set();
    setSelected(null);
    setComposerMode(null);
    setEditingId(null);
    setPendingDelete(null);
    commitList([], false);
    setError(null);

    if (!slug) {
      setIsLoading(false);
      return () => {
        active = false;
        controller.abort();
      };
    }

    setIsLoading(true);
    listMessages(slug, { limit: PAGE_SIZE, signal: controller.signal })
      .then((data) => {
        if (!active || gen !== fetchGenRef.current || slugRef.current !== groupSlug) return;
        commitList([...data.messages].sort(sortNewestFirst), data.hasMore);
      })
      .catch((err: unknown) => {
        if (!active || gen !== fetchGenRef.current || slugRef.current !== groupSlug || isAbortError(err)) return;
        setError(getApiErrorMessage(err, "Kunde inte ladda Aktuellt."));
      })
      .finally(() => {
        if (active && slugRef.current === groupSlug) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [commitList, groupSlug]);

  const loadOlder = useCallback(async () => {
    const slug = groupSlug?.trim();
    if (!slug || isLoadingMore || !hasMoreRef.current) return;
    const before = oldestCursor(messagesRef.current);
    if (!before) return;

    const moreId = ++moreGenRef.current;
    const fetchId = fetchGenRef.current;
    setIsLoadingMore(true);
    try {
      const data = await listMessages(slug, { limit: PAGE_SIZE, before });
      if (
        moreId !== moreGenRef.current ||
        fetchId !== fetchGenRef.current ||
        slugRef.current !== groupSlug
      ) {
        return;
      }
      commitList(mergeById(visibleMessages(messagesRef.current), visibleMessages(data.messages)), data.hasMore);
    } catch (err) {
      if (
        moreId !== moreGenRef.current ||
        fetchId !== fetchGenRef.current ||
        slugRef.current !== groupSlug ||
        isAbortError(err)
      ) {
        return;
      }
      setError(getApiErrorMessage(err, "Kunde inte ladda äldre meddelanden."));
    } finally {
      if (moreId === moreGenRef.current) setIsLoadingMore(false);
    }
  }, [commitList, groupSlug, isLoadingMore, visibleMessages]);

  const openMessage = useCallback(async (message: FeedMessage) => {
    const slug = groupSlug;
    setSelected(message);
    if (message.isRead) return;

    const marked = messagesRef.current.map((item) =>
      item.messageId === message.messageId ? { ...item, isRead: true } : item
    );
    commitList(marked, hasMoreRef.current);
    decrementUnreadOptimistic();
    try {
      await markMessageRead(message.messageId);
      if (slugRef.current !== slug) return;
      await refetchUnread();
    } catch (err) {
      if (slugRef.current !== slug) return;
      const rolledBack = messagesRef.current.map((item) =>
        item.messageId === message.messageId ? { ...item, isRead: false } : item
      );
      commitList(rolledBack, hasMoreRef.current);
      setError(getApiErrorMessage(err, "Kunde inte markera meddelandet som läst."));
      await refetchUnread();
    }
  }, [commitList, decrementUnreadOptimistic, groupSlug, refetchUnread]);

  const closeComposer = useCallback(() => {
    if (isSaving) return;
    setComposerMode(null);
    setEditingId(null);
    setFormError(null);
  }, [isSaving]);

  const openCreate = useCallback(() => {
    setDraftTitle("");
    setDraftBody("");
    setFormError(null);
    setEditingId(null);
    setComposerMode("create");
  }, []);

  const openEdit = useCallback((message: FeedMessage) => {
    setDraftTitle(message.title);
    setDraftBody(message.body);
    setFormError(null);
    setEditingId(message.messageId);
    setComposerMode("edit");
  }, []);

  const submitComposer = useCallback(async () => {
    const slug = groupSlug?.trim();
    if (!slug || !composerMode) return;
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
        await createGroupMessage(slug, draft);
      } else if (editingId) {
        const updated = await updateMessage(editingId, draft);
        if (slugRef.current !== groupSlug) return;
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
      if (slugRef.current !== groupSlug) return;
      setComposerMode(null);
      setEditingId(null);
      await refreshFirstPage("merge");
    } catch (err) {
      if (slugRef.current !== groupSlug || isAbortError(err)) return;
      setFormError(
        getApiErrorMessage(
          err,
          composerMode === "create"
            ? "Kunde inte publicera meddelandet."
            : "Kunde inte spara meddelandet."
        )
      );
    } finally {
      if (slugRef.current === groupSlug) setIsSaving(false);
    }
  }, [composerMode, draftBody, draftTitle, editingId, groupSlug, refreshFirstPage]);

  const requestDelete = useCallback((message: FeedMessage) => {
    setDeleteError(null);
    setPendingDelete(message);
  }, []);

  const cancelDelete = useCallback(() => {
    if (isDeleting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }, [isDeleting]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const removedId = pendingDelete.messageId;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteMessage(removedId);
      removedIdsRef.current.add(removedId);
      if (slugRef.current !== groupSlug) return;
      if (selected?.messageId === removedId) setSelected(null);
      commitList(
        messagesRef.current.filter((item) => item.messageId !== removedId),
        hasMoreRef.current
      );
      setPendingDelete(null);
      await refreshFirstPage("merge");
      if (slugRef.current !== groupSlug) return;
      await refetchUnread();
    } catch (err) {
      if (slugRef.current !== groupSlug || isAbortError(err)) return;
      removedIdsRef.current.delete(removedId);
      setDeleteError(getApiErrorMessage(err, "Kunde inte ta bort meddelandet."));
    } finally {
      if (slugRef.current === groupSlug) setIsDeleting(false);
    }
  }, [commitList, groupSlug, pendingDelete, refetchUnread, refreshFirstPage, selected?.messageId]);

  const uuid = callerUuid(user);
  const canCreate = user?.role === "admin" || user?.role === "leader";
  const canManage = useCallback(
    (message: FeedMessage) => canManageMessage(user?.role, uuid, message),
    [user?.role, uuid]
  );

  return {
    messages,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    unreadStatus,
    selected,
    setSelected,
    composerMode,
    draftTitle,
    setDraftTitle,
    draftBody,
    setDraftBody,
    formError,
    isSaving,
    pendingDelete,
    isDeleting,
    deleteError,
    canCreate,
    canManage,
    titleMax: TITLE_MAX,
    bodyMax: BODY_MAX,
    loadOlder,
    openMessage,
    closeComposer,
    openCreate,
    openEdit,
    submitComposer,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
