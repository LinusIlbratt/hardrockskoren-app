import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_MESSAGE_API_URL as string | undefined;

function requireBaseUrl(): string {
  if (!API_BASE_URL?.trim()) {
    throw new Error(
      "VITE_MESSAGE_API_URL is not configured. Add it to your .env file after deploying message-api."
    );
  }
  return API_BASE_URL.replace(/\/$/, "");
}

function authHeaders(): { Authorization: string } {
  const token = localStorage.getItem("authToken");
  if (!token) {
    throw new Error("Authentication token is missing.");
  }
  return { Authorization: `Bearer ${token}` };
}

export type FeedMessage = {
  messageId: string;
  groupSlug: string;
  title: string;
  body: string;
  createdAt: string;
  createdByName?: string;
  createdByGivenName?: string;
  isRead: boolean;
  scope: "all" | "group";
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

  const base = requireBaseUrl();
  const response = await axios.post<CreateMessageResponse>(
    `${base}/messages`,
    {
      title: input.title.trim(),
      body: input.body.trim(),
      targets: input.targets,
    },
    {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
    }
  );
  return response.data;
}

export async function listSentMessages(options?: {
  limit?: number;
  before?: string;
}): Promise<ListSentResult> {
  const base = requireBaseUrl();
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.before) {
    params.set("before", options.before);
  }
  const qs = params.toString();
  const response = await axios.get<{ messages: SentMessage[]; hasMore?: boolean }>(
    `${base}/messages/sent${qs ? `?${qs}` : ""}`,
    { headers: authHeaders() }
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
  options?: { limit?: number; before?: string }
): Promise<ListMessagesResult> {
  const base = requireBaseUrl();
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.before) {
    params.set("before", options.before);
  }
  const qs = params.toString();
  const response = await axios.get<{
    messages: FeedMessage[];
    hasMore?: boolean;
  }>(
    `${base}/groups/${encodeURIComponent(groupSlug)}/messages${qs ? `?${qs}` : ""}`,
    { headers: authHeaders() }
  );
  return {
    messages: response.data.messages ?? [],
    hasMore: Boolean(response.data?.hasMore),
  };
}

export async function getUnreadStatus(groupSlug: string): Promise<UnreadStatus> {
  const base = requireBaseUrl();
  const response = await axios.get<UnreadStatus>(
    `${base}/groups/${encodeURIComponent(groupSlug)}/messages/unread-status`,
    { headers: authHeaders() }
  );
  return response.data;
}

export async function markMessageRead(messageId: string): Promise<void> {
  const base = requireBaseUrl();
  await axios.post(
    `${base}/messages/${encodeURIComponent(messageId)}/read`,
    {},
    { headers: { ...authHeaders(), "Content-Type": "application/json" } }
  );
}

export async function deleteMessage(
  messageId: string,
  groupSlug?: string
): Promise<void> {
  const base = requireBaseUrl();
  const qs = groupSlug
    ? `?groupSlug=${encodeURIComponent(groupSlug)}`
    : "";
  await axios.delete(`${base}/messages/${encodeURIComponent(messageId)}${qs}`, {
    headers: authHeaders(),
  });
}
