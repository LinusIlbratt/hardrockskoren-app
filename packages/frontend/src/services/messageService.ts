import { createAuthedClient } from "@/services/apiClient";
import { getAuthHeaders } from "@/utils/authHeaders";

const API_BASE_URL = import.meta.env.VITE_MESSAGE_API_URL as string | undefined;

function requireBaseUrl(): string {
  if (!API_BASE_URL?.trim()) {
    throw new Error(
      "VITE_MESSAGE_API_URL is not configured. Add it to your .env file after deploying message-api."
    );
  }
  return API_BASE_URL.replace(/\/$/, "");
}

function client() {
  if (!getAuthHeaders().Authorization) {
    throw new Error("Authentication token is missing.");
  }
  return createAuthedClient(requireBaseUrl());
}

export type FeedMessage = {
  messageId: string;
  groupSlug: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  createdByUuid?: string;
  createdByName?: string;
  createdByGivenName?: string;
  isRead: boolean;
  scope: "all" | "group";
};

export type MessageDraft = {
  title: string;
  body: string;
};

export type WrittenMessage = {
  messageId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  createdByUuid?: string;
  scope?: string;
  targets?: string[];
};

export type UnreadStatus = {
  hasUnread: boolean;
  unreadCount: number;
};

export type CreateMessageInput = {
  title: string;
  body: string;
  /** ["ALL"] or one/many choir slugs — never mix ALL with slugs. */
  targets: string[];
};

export type CreateMessageResponse = {
  title: string;
  body: string;
  createdAt: string;
  scope: "all" | "groups";
  targets: string[];
  count: number;
  messageId: string;
  messages: Array<{ messageId: string; groupSlug: string }>;
};

export type SentMessage = {
  messageId: string;
  title: string;
  body: string;
  createdAt: string;
  createdByUuid: string;
  createdByName?: string;
  createdByGivenName?: string;
  scope: "all" | "groups";
  targets: string[];
};

export type ListMessagesResult = {
  messages: FeedMessage[];
  hasMore: boolean;
};

export type ListSentResult = {
  messages: SentMessage[];
  hasMore: boolean;
};

export async function createMessage(
  input: CreateMessageInput
): Promise<CreateMessageResponse> {
  if (!input.title?.trim()) {
    throw new Error("title is required.");
  }
  if (!input.body?.trim()) {
    throw new Error("body is required.");
  }
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    throw new Error("targets must be a non-empty array.");
  }

  const response = await client().post<CreateMessageResponse>("/messages", {
    title: input.title.trim(),
    body: input.body.trim(),
    targets: input.targets,
  });
  return response.data;
}

const TITLE_MAX = 120;
const BODY_MAX = 4000;

function parseMessageDraft(data: MessageDraft): { title: string; body: string } {
  const title = data.title?.trim() ?? "";
  const body = data.body?.trim() ?? "";
  if (!title) {
    throw new Error("title is required.");
  }
  if (title.length > TITLE_MAX) {
    throw new Error(`title must be at most ${TITLE_MAX} characters.`);
  }
  if (!body) {
    throw new Error("body is required.");
  }
  if (body.length > BODY_MAX) {
    throw new Error(`body must be at most ${BODY_MAX} characters.`);
  }
  return { title, body };
}

export async function createGroupMessage(
  groupSlug: string,
  data: MessageDraft
): Promise<WrittenMessage> {
  const slug = groupSlug?.trim() ?? "";
  if (!slug) {
    throw new Error("groupSlug is required.");
  }
  const draft = parseMessageDraft(data);
  const response = await client().post<WrittenMessage>(
    `/groups/${encodeURIComponent(slug)}/messages`,
    draft
  );
  return response.data;
}

export async function updateMessage(
  messageId: string,
  data: MessageDraft
): Promise<WrittenMessage> {
  const id = messageId?.trim() ?? "";
  if (!id) {
    throw new Error("messageId is required.");
  }
  const draft = parseMessageDraft(data);
  const response = await client().put<WrittenMessage>(
    `/messages/${encodeURIComponent(id)}`,
    draft
  );
  return response.data;
}

export async function listSentMessages(options?: {
  limit?: number;
  before?: string;
  signal?: AbortSignal;
}): Promise<ListSentResult> {
  const response = await client().get<{ messages: SentMessage[]; hasMore?: boolean }>(
    "/messages/sent",
    {
      signal: options?.signal,
      params: {
        ...(options?.limit !== undefined ? { limit: options.limit } : {}),
        ...(options?.before ? { before: options.before } : {}),
      },
    }
  );
  return {
    messages: Array.isArray(response.data?.messages)
      ? response.data.messages
      : [],
    hasMore: Boolean(response.data?.hasMore),
  };
}

export async function listMessages(
  groupSlug: string,
  options?: { limit?: number; before?: string; signal?: AbortSignal }
): Promise<ListMessagesResult> {
  const slug = groupSlug?.trim() ?? "";
  if (!slug || slug.includes("/") || slug.includes("\\") || slug.includes("..")) {
    throw new Error("Ogiltig kör.");
  }
  const response = await client().get<{
    messages: FeedMessage[];
    hasMore?: boolean;
  }>(`/groups/${encodeURIComponent(slug)}/messages`, {
    signal: options?.signal,
    params: {
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.before ? { before: options.before } : {}),
    },
  });
  return {
    messages: response.data.messages ?? [],
    hasMore: Boolean(response.data?.hasMore),
  };
}

export async function getUnreadStatus(groupSlug: string): Promise<UnreadStatus> {
  const response = await client().get<UnreadStatus>(
    `/groups/${encodeURIComponent(groupSlug)}/messages/unread-status`
  );
  return response.data;
}

export async function markMessageRead(
  messageId: string,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const id = messageId?.trim() ?? "";
  if (!id) {
    throw new Error("messageId is required.");
  }
  await client().post(`/messages/${encodeURIComponent(id)}/read`, {}, {
    signal: options?.signal,
  });
}

export async function deleteMessage(
  messageId: string,
  groupSlug?: string
): Promise<void> {
  const id = messageId?.trim() ?? "";
  if (!id) {
    throw new Error("messageId is required.");
  }
  await client().delete(`/messages/${encodeURIComponent(id)}`, {
    params: groupSlug ? { groupSlug } : undefined,
  });
}
