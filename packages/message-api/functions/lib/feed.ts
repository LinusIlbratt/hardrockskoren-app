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
  type MessageFeedItem,
} from "../../../core/utils/messageFeed";
import {
  ALL_TARGET,
  MESSAGE_FEED_LIMIT,
  messagePk,
  messageMetaPk,
  messageReadSk,
  type MessageMetaRecord,
  type MessageRecord,
} from "./keys";

export async function queryMessagesForPk(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  limit: number = MESSAGE_FEED_LIMIT
): Promise<MessageFeedItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":skPrefix": "MSG#",
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  return (result.Items ?? [])
    .filter((item) => item?.type === "Message")
    .map((item) => ({
      messageId: String(item.messageId),
      groupSlug: String(item.groupSlug),
      title: String(item.title ?? ""),
      body: String(item.body ?? ""),
      createdAt: String(item.createdAt),
      createdByUuid: item.createdByUuid ? String(item.createdByUuid) : undefined,
    }));
}

export async function loadFeedForGroup(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  groupSlug: string
): Promise<MessageFeedItem[]> {
  const [choir, all] = await Promise.all([
    queryMessagesForPk(docClient, tableName, messagePk(groupSlug)),
    queryMessagesForPk(docClient, tableName, messagePk(ALL_TARGET)),
  ]);
  return mergeMessageFeeds(choir, all, MESSAGE_FEED_LIMIT);
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

  // BatchGet max 100; we cap feed at 50
  const result = await docClient.send(
    new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: keys,
        },
      },
    })
  );

  const items = result.Responses?.[tableName] ?? [];
  for (const item of items) {
    if (item?.messageId) {
      readIds.add(String(item.messageId));
    }
  }
  return readIds;
}

export async function getMessageMeta(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  messageId: string
): Promise<MessageMetaRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: messageMetaPk(messageId), SK: "META" },
    })
  );
  if (!result.Item || result.Item.type !== "MessageMeta") return null;
  return result.Item as MessageMetaRecord;
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

export type { MessageRecord };
