import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchGetCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  mergeMessageFeeds,
  computeUnread,
  scopeFromGroupSlug,
  clampMessageFeedLimit,
  messageFeedCursor,
  MESSAGE_FEED_LIMIT,
  MESSAGE_FEED_PAGE_SIZE,
  type MessageFeedItem,
} from "../../../core/utils/messageFeed";
import {
  ALL_TARGET,
  SENT_GSI1_PK,
  groupPk,
  messageCanonicalPk,
  messageReadSk,
  type MessageCanonicalRecord,
  type MessageMetaRecord,
  type MessageScope,
} from "./keys";

export type ResolvedMessage = {
  messageId: string;
  title: string;
  body: string;
  createdAt: string;
  createdByUuid: string;
  createdByName?: string;
  createdByGivenName?: string;
  scope: MessageScope;
  targets: string[];
  /** Partition slug where this row was found (choir or ALL) — for feed display. */
  feedGroupSlug: string;
};

export type FeedPage = {
  items: MessageFeedItem[];
  hasMore: boolean;
};

export type SentPage = {
  items: ResolvedMessage[];
  hasMore: boolean;
};

/**
 * Load canonical message. Supports MessageCanonical (new) and MessageMeta (legacy).
 */
export async function getCanonicalMessage(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  messageId: string
): Promise<ResolvedMessage | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: messageCanonicalPk(messageId), SK: "META" },
    })
  );
  const item = result.Item;
  if (!item) return null;

  if (item.type === "MessageCanonical") {
    const c = item as MessageCanonicalRecord;
    const targets = Array.isArray(c.targets)
      ? c.targets.map(String)
      : [ALL_TARGET];
    return {
      messageId: String(c.messageId),
      title: String(c.title ?? ""),
      body: String(c.body ?? ""),
      createdAt: String(c.createdAt),
      createdByUuid: String(c.createdByUuid ?? ""),
      createdByName: c.createdByName ? String(c.createdByName) : undefined,
      createdByGivenName: c.createdByGivenName
        ? String(c.createdByGivenName)
        : undefined,
      scope: c.scope === "all" ? "all" : "groups",
      targets,
      feedGroupSlug: targets[0] ?? ALL_TARGET,
    };
  }

  if (item.type === "MessageMeta") {
    const m = item as MessageMetaRecord;
    const groupSlug = String(m.groupSlug);
    return {
      messageId: String(m.messageId),
      title: String(m.title ?? ""),
      body: String(m.body ?? ""),
      createdAt: String(m.createdAt),
      createdByUuid: String(m.createdByUuid ?? ""),
      scope: groupSlug === ALL_TARGET ? "all" : "groups",
      targets: [groupSlug],
      feedGroupSlug: groupSlug,
    };
  }

  return null;
}

/** @deprecated */
export async function getMessageMeta(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  messageId: string
): Promise<MessageMetaRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: messageCanonicalPk(messageId), SK: "META" },
    })
  );
  if (!result.Item || result.Item.type !== "MessageMeta") return null;
  return result.Item as MessageMetaRecord;
}

type PartitionHit =
  | { kind: "ref"; messageId: string; groupSlug: string; createdAt: string }
  | {
      kind: "legacy";
      messageId: string;
      groupSlug: string;
      createdAt: string;
      title: string;
      body: string;
      createdByUuid?: string;
    };

/**
 * @param beforeCursor `{createdAt}#{messageId}` — return items strictly older than this.
 */
async function queryPartitionHits(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  limit: number,
  beforeCursor?: string | null
): Promise<PartitionHit[]> {
  const values: Record<string, string> = { ":pk": pk };
  let keyCondition: string;

  if (beforeCursor) {
    keyCondition = "PK = :pk AND SK BETWEEN :skStart AND :skEnd";
    values[":skStart"] = "MSG#";
    values[":skEnd"] = `MSG#${beforeCursor}`;
  } else {
    keyCondition = "PK = :pk AND begins_with(SK, :skPrefix)";
    values[":skPrefix"] = "MSG#";
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: values,
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  const hits: PartitionHit[] = [];
  const cursorSk = beforeCursor ? `MSG#${beforeCursor}` : null;

  for (const item of result.Items ?? []) {
    if (cursorSk && typeof item.SK === "string" && item.SK === cursorSk) {
      continue;
    }

    if (item.type === "MessageRef" && item.messageId) {
      hits.push({
        kind: "ref",
        messageId: String(item.messageId),
        groupSlug: String(item.groupSlug ?? ""),
        createdAt: String(item.createdAt ?? ""),
      });
      continue;
    }
    if (item.type === "Message" && item.messageId && item.body !== undefined) {
      hits.push({
        kind: "legacy",
        messageId: String(item.messageId),
        groupSlug: String(item.groupSlug ?? ""),
        createdAt: String(item.createdAt ?? ""),
        title: String(item.title ?? ""),
        body: String(item.body ?? ""),
        createdByUuid: item.createdByUuid
          ? String(item.createdByUuid)
          : undefined,
      });
    }
  }
  return hits;
}

async function batchGetCanonicals(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  messageIds: string[]
): Promise<Map<string, ResolvedMessage>> {
  const map = new Map<string, ResolvedMessage>();
  if (messageIds.length === 0) return map;

  const unique = Array.from(new Set(messageIds));
  const keys = unique.map((messageId) => ({
    PK: messageCanonicalPk(messageId),
    SK: "META",
  }));

  let pending = keys;
  for (let attempt = 0; attempt < 2 && pending.length > 0; attempt++) {
    const result = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName]: { Keys: pending },
        },
      })
    );

    for (const item of result.Responses?.[tableName] ?? []) {
      const id = item?.messageId ? String(item.messageId) : "";
      if (!id) continue;

      if (item.type === "MessageCanonical") {
        const targets = Array.isArray(item.targets)
          ? item.targets.map(String)
          : [ALL_TARGET];
        map.set(id, {
          messageId: id,
          title: String(item.title ?? ""),
          body: String(item.body ?? ""),
          createdAt: String(item.createdAt),
          createdByUuid: String(item.createdByUuid ?? ""),
          createdByName: item.createdByName
            ? String(item.createdByName)
            : undefined,
          createdByGivenName: item.createdByGivenName
            ? String(item.createdByGivenName)
            : undefined,
          scope: item.scope === "all" ? "all" : "groups",
          targets,
          feedGroupSlug: targets[0] ?? ALL_TARGET,
        });
      } else if (item.type === "MessageMeta") {
        const groupSlug = String(item.groupSlug);
        map.set(id, {
          messageId: id,
          title: String(item.title ?? ""),
          body: String(item.body ?? ""),
          createdAt: String(item.createdAt),
          createdByUuid: String(item.createdByUuid ?? ""),
          scope: groupSlug === ALL_TARGET ? "all" : "groups",
          targets: [groupSlug],
          feedGroupSlug: groupSlug,
        });
      }
    }

    const unprocessed = result.UnprocessedKeys?.[tableName]?.Keys;
    pending = Array.isArray(unprocessed)
      ? (unprocessed as Array<{ PK: string; SK: string }>)
      : [];
  }

  return map;
}

export async function loadFeedForGroup(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  groupSlug: string,
  options?: { limit?: number; before?: string | null }
): Promise<FeedPage> {
  const limit = clampMessageFeedLimit(
    options?.limit,
    MESSAGE_FEED_PAGE_SIZE
  );
  const before = options?.before?.trim() || null;
  const fetchLimit = Math.min(limit + 1, MESSAGE_FEED_LIMIT);

  const [choirHits, allHits] = await Promise.all([
    queryPartitionHits(
      docClient,
      tableName,
      groupPk(groupSlug),
      fetchLimit,
      before
    ),
    queryPartitionHits(
      docClient,
      tableName,
      groupPk(ALL_TARGET),
      fetchLimit,
      before
    ),
  ]);

  const refIds = [...choirHits, ...allHits]
    .filter((h) => h.kind === "ref")
    .map((h) => h.messageId);

  const canonicals = await batchGetCanonicals(docClient, tableName, refIds);

  const toFeedItem = (hit: PartitionHit): MessageFeedItem | null => {
    if (hit.kind === "legacy") {
      return {
        messageId: hit.messageId,
        groupSlug: hit.groupSlug,
        title: hit.title,
        body: hit.body,
        createdAt: hit.createdAt,
        createdByUuid: hit.createdByUuid,
      };
    }
    const c = canonicals.get(hit.messageId);
    if (!c) return null;
    return {
      messageId: c.messageId,
      groupSlug: hit.groupSlug || c.feedGroupSlug,
      title: c.title,
      body: c.body,
      createdAt: c.createdAt || hit.createdAt,
      createdByUuid: c.createdByUuid,
      createdByName: c.createdByName,
      createdByGivenName: c.createdByGivenName,
    };
  };

  const choirItems = choirHits
    .map(toFeedItem)
    .filter((x): x is MessageFeedItem => x !== null);
  const allItems = allHits
    .map(toFeedItem)
    .filter((x): x is MessageFeedItem => x !== null);

  const merged = mergeMessageFeeds(
    choirItems,
    allItems,
    fetchLimit * 2
  ).filter((m) => {
    if (!before) return true;
    return messageFeedCursor(m.createdAt, m.messageId) < before;
  });

  const items = merged.slice(0, limit);
  const hasMore = merged.length > limit;
  return { items, hasMore };
}

export async function loadReadIds(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userUuid: string,
  messageIds: string[]
): Promise<Set<string>> {
  const readIds = new Set<string>();
  if (messageIds.length === 0) return readIds;

  const keys = messageIds.map((messageId) => ({
    PK: `USER#${userUuid}`,
    SK: messageReadSk(messageId),
  }));

  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    let pending = chunk;
    for (let attempt = 0; attempt < 2 && pending.length > 0; attempt++) {
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: { Keys: pending },
          },
        })
      );

      for (const item of result.Responses?.[tableName] ?? []) {
        if (item?.messageId) {
          readIds.add(String(item.messageId));
        }
      }

      const unprocessed = result.UnprocessedKeys?.[tableName]?.Keys;
      pending = Array.isArray(unprocessed)
        ? (unprocessed as Array<{ PK: string; SK: string }>)
        : [];
    }
  }
  return readIds;
}

export async function listSentMessages(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  options?: { limit?: number; before?: string | null }
): Promise<SentPage> {
  const limit = clampMessageFeedLimit(
    options?.limit,
    MESSAGE_FEED_PAGE_SIZE
  );
  const before = options?.before?.trim() || null;
  const fetchLimit = Math.min(limit + 1, MESSAGE_FEED_LIMIT);

  const values: Record<string, string> = { ":pk": SENT_GSI1_PK };
  let keyCondition = "GSI1PK = :pk";
  if (before) {
    keyCondition = "GSI1PK = :pk AND GSI1SK < :before";
    values[":before"] = before;
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: values,
      ScanIndexForward: false,
      Limit: fetchLimit,
    })
  );

  const out: ResolvedMessage[] = [];
  for (const item of result.Items ?? []) {
    if (item.type !== "MessageCanonical") continue;
    const targets = Array.isArray(item.targets)
      ? item.targets.map(String)
      : [ALL_TARGET];
    out.push({
      messageId: String(item.messageId),
      title: String(item.title ?? ""),
      body: String(item.body ?? ""),
      createdAt: String(item.createdAt),
      createdByUuid: String(item.createdByUuid ?? ""),
      createdByName: item.createdByName
        ? String(item.createdByName)
        : undefined,
      createdByGivenName: item.createdByGivenName
        ? String(item.createdByGivenName)
        : undefined,
      scope: item.scope === "all" ? "all" : "groups",
      targets,
      feedGroupSlug: targets[0] ?? ALL_TARGET,
    });
  }

  const items = out.slice(0, limit);
  const hasMore = out.length > limit;
  return { items, hasMore };
}

export function toFeedResponse(
  messages: MessageFeedItem[],
  readIds: Set<string>
) {
  return messages.map((m) => ({
    messageId: m.messageId,
    groupSlug: m.groupSlug,
    title: m.title,
    body: m.body,
    createdAt: m.createdAt,
    createdByName: m.createdByName,
    createdByGivenName: m.createdByGivenName,
    isRead: readIds.has(m.messageId),
    scope: scopeFromGroupSlug(m.groupSlug),
  }));
}

export function unreadFromFeed(
  messages: MessageFeedItem[],
  readIds: Set<string>
) {
  return computeUnread(messages, readIds);
}
