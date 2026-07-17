import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { nanoid } from "nanoid";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import {
  ALL_TARGET,
  messagePk,
  messageSk,
  messageMetaPk,
  parseCreateTargets,
} from "../lib/keys";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TITLE_MAX = 120;
const BODY_MAX = 4000;

type CreatedMessageRef = {
  messageId: string;
  groupSlug: string;
};

function parseTitleAndBody(
  body: Record<string, unknown>
): { ok: true; title: string; messageBody: string } | { ok: false; message: string } {
  const titleRaw = body.title;
  if (typeof titleRaw !== "string" || titleRaw.trim() === "") {
    return { ok: false, message: "title is required and must be a non-empty string." };
  }
  const title = titleRaw.trim();
  if (title.length > TITLE_MAX) {
    return { ok: false, message: `title must be at most ${TITLE_MAX} characters.` };
  }

  const bodyRaw = body.body;
  if (typeof bodyRaw !== "string" || bodyRaw.trim() === "") {
    return { ok: false, message: "body is required and must be a non-empty string." };
  }
  const messageBody = bodyRaw.trim();
  if (messageBody.length > BODY_MAX) {
    return { ok: false, message: `body must be at most ${BODY_MAX} characters.` };
  }

  return { ok: true, title, messageBody };
}

async function assertChoirsExist(
  tableName: string,
  groupSlugs: string[]
): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  let pendingKeys = groupSlugs.map((slug) => ({
    PK: messagePk(slug),
    SK: "METADATA",
  }));
  const found = new Set<string>();

  // BatchGet can return UnprocessedKeys; retry once.
  for (let attempt = 0; attempt < 2 && pendingKeys.length > 0; attempt++) {
    const result = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName]: { Keys: pendingKeys },
        },
      })
    );

    for (const item of result.Responses?.[tableName] ?? []) {
      if (typeof item.PK === "string" && item.PK.startsWith("GROUP#")) {
        const slug = item.PK.slice("GROUP#".length);
        if (slug && slug !== ALL_TARGET) {
          found.add(slug);
        }
      }
    }

    const unprocessed = result.UnprocessedKeys?.[tableName]?.Keys;
    pendingKeys = Array.isArray(unprocessed)
      ? (unprocessed as Array<{ PK: string; SK: string }>)
      : [];
  }

  if (pendingKeys.length > 0) {
    console.error("assertChoirsExist: UnprocessedKeys remaining", pendingKeys);
    throw new Error("Could not verify all target choirs (BatchGet unprocessed keys).");
  }

  const stillMissing = groupSlugs.filter((slug) => !found.has(slug));
  if (stillMissing.length > 0) {
    return { ok: false, missing: stillMissing };
  }
  return { ok: true };
}

function buildMessageItems(params: {
  groupSlug: string;
  title: string;
  messageBody: string;
  createdAt: string;
  createdByUuid: string;
}): { messageItem: Record<string, unknown>; metaItem: Record<string, unknown>; ref: CreatedMessageRef } {
  const messageId = nanoid();
  const pk = messagePk(params.groupSlug);
  const sk = messageSk(params.createdAt, messageId);

  const messageItem = {
    PK: pk,
    SK: sk,
    messageId,
    groupSlug: params.groupSlug,
    title: params.title,
    body: params.messageBody,
    createdAt: params.createdAt,
    createdByUuid: params.createdByUuid,
    type: "Message",
    GSI1PK: pk,
    GSI1SK: sk,
  };

  const metaItem = {
    PK: messageMetaPk(messageId),
    SK: "META",
    type: "MessageMeta",
    messageId,
    groupSlug: params.groupSlug,
    targetPk: pk,
    targetSk: sk,
    title: params.title,
    body: params.messageBody,
    createdAt: params.createdAt,
    createdByUuid: params.createdByUuid,
  };

  return {
    messageItem,
    metaItem,
    ref: { messageId, groupSlug: params.groupSlug },
  };
}

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  const tableName = process.env.MAIN_TABLE;
  if (!tableName) {
    return sendError(500, "Server configuration error.");
  }

  const uuid = event.requestContext.authorizer?.lambda?.uuid?.trim();
  if (!uuid) {
    return sendError(401, "User identity is missing from the request context.");
  }

  if (!event.body?.trim()) {
    return sendError(400, "Request body is required.");
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body) as Record<string, unknown>;
  } catch {
    return sendError(400, "Invalid JSON body.");
  }

  const content = parseTitleAndBody(body);
  if (!content.ok) {
    return sendError(400, content.message);
  }

  const targetsResult = parseCreateTargets(body);
  if (!targetsResult.ok) {
    return sendError(400, targetsResult.message);
  }

  const { title, messageBody } = content;
  const resolved = targetsResult.value;
  const createdAt = new Date().toISOString();

  try {
    const destinationSlugs =
      resolved.mode === "all" ? [ALL_TARGET] : resolved.groupSlugs;

    if (resolved.mode === "groups") {
      const existence = await assertChoirsExist(tableName, resolved.groupSlugs);
      if (!existence.ok) {
        return sendError(
          404,
          `Target choir(s) not found: ${existence.missing.join(", ")}.`
        );
      }
    }

    const built = destinationSlugs.map((groupSlug) =>
      buildMessageItems({
        groupSlug,
        title,
        messageBody,
        createdAt,
        createdByUuid: uuid,
      })
    );

    // Atomic fan-out: all Message+Meta puts succeed or none do (no partial sends).
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: built.flatMap(({ messageItem, metaItem }) => [
          { Put: { TableName: tableName, Item: messageItem } },
          { Put: { TableName: tableName, Item: metaItem } },
        ]),
      })
    );

    const messages = built.map((b) => b.ref);
    const scope = resolved.mode === "all" ? "all" : "groups";

    return sendResponse(
      {
        title,
        body: messageBody,
        createdAt,
        scope,
        count: messages.length,
        messages,
        // Convenience for single-target clients
        messageId: messages[0]?.messageId,
        groupSlug: messages[0]?.groupSlug,
      },
      201
    );
  } catch (err) {
    console.error("createMessage failed", err);
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    if (name === "TransactionCanceledException") {
      return sendError(
        409,
        "Could not create message(s) due to a write conflict. Please try again."
      );
    }
    if (
      err instanceof Error &&
      err.message.includes("BatchGet unprocessed keys")
    ) {
      return sendError(503, "Could not verify target choirs. Please try again.");
    }
    return sendError(500, "Failed to create message.");
  }
};
