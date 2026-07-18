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
  SENT_GSI1_PK,
  groupPk,
  messageCanonicalPk,
  messageRefSk,
  parseCreateTargets,
  sentGsi1Sk,
  targetsFromResolved,
} from "../lib/keys";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TITLE_MAX = 120;
const BODY_MAX = 4000;

function parseTitleAndBody(
  body: Record<string, unknown>
):
  | { ok: true; title: string; messageBody: string }
  | { ok: false; message: string } {
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
    PK: groupPk(slug),
    SK: "METADATA",
  }));
  const found = new Set<string>();

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

  const given =
    typeof event.requestContext.authorizer?.lambda?.given_name === "string"
      ? event.requestContext.authorizer.lambda.given_name.trim()
      : "";
  const family =
    typeof event.requestContext.authorizer?.lambda?.family_name === "string"
      ? event.requestContext.authorizer.lambda.family_name.trim()
      : "";
  const createdByGivenName = given || undefined;
  const createdByName =
    [given, family].filter(Boolean).join(" ").trim() || undefined;

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
  const { scope, targets } = targetsFromResolved(resolved);
  const createdAt = new Date().toISOString();
  const messageId = nanoid();

  try {
    if (resolved.mode === "groups") {
      const existence = await assertChoirsExist(tableName, resolved.groupSlugs);
      if (!existence.ok) {
        return sendError(
          404,
          `Target choir(s) not found: ${existence.missing.join(", ")}.`
        );
      }
    }

    const canonical = {
      PK: messageCanonicalPk(messageId),
      SK: "META",
      type: "MessageCanonical",
      messageId,
      title,
      body: messageBody,
      createdAt,
      createdByUuid: uuid,
      ...(createdByName ? { createdByName } : {}),
      ...(createdByGivenName ? { createdByGivenName } : {}),
      scope,
      targets,
      GSI1PK: SENT_GSI1_PK,
      GSI1SK: sentGsi1Sk(createdAt, messageId),
    };

    const refPuts = targets.map((groupSlug) => {
      const pk = groupPk(groupSlug);
      const sk = messageRefSk(createdAt, messageId);
      return {
        Put: {
          TableName: tableName,
          Item: {
            PK: pk,
            SK: sk,
            type: "MessageRef",
            messageId,
            groupSlug,
            createdAt,
          },
        },
      };
    });

    // 1 canonical + N thin refs — atomic, no body duplication.
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [{ Put: { TableName: tableName, Item: canonical } }, ...refPuts],
      })
    );

    return sendResponse(
      {
        messageId,
        title,
        body: messageBody,
        createdAt,
        scope,
        targets,
        count: 1,
        messages: [{ messageId, groupSlug: targets[0] }],
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
        "Could not create message due to a write conflict. Please try again."
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
