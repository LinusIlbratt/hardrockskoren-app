import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { nanoid } from "nanoid";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { requireGroupAccessResponse } from "../../../core/utils/requireGroupAccess";
import type { AuthContext } from "../../../core/types";
import {
  ALL_TARGET,
  SENT_GSI1_PK,
  groupPk,
  messageCanonicalPk,
  messageRefSk,
  sentGsi1Sk,
} from "../lib/keys";
import { resolveCreatorNames } from "../lib/senderNames";

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

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  const tableName = process.env.MAIN_TABLE;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!tableName || !userPoolId) {
    return sendError(500, "Server configuration error.");
  }

  const groupSlug = event.pathParameters?.groupSlug;
  const authDenied = await requireGroupAccessResponse(
    event.requestContext.authorizer?.lambda,
    groupSlug
  );
  if (authDenied) return authDenied;

  const uuid = event.requestContext.authorizer?.lambda?.uuid?.trim();
  if (!uuid) {
    return sendError(401, "User identity is missing from the request context.");
  }

  let slug: string;
  try {
    slug = decodeURIComponent(groupSlug!).trim();
  } catch {
    return sendError(400, "Group name is required in the path.");
  }
  if (!slug) {
    return sendError(400, "Group name is required in the path.");
  }
  if (slug.toUpperCase() === ALL_TARGET) {
    return sendError(400, 'Use a choir slug in the path; "ALL" is not allowed.');
  }

  const { createdByGivenName, createdByName } = await resolveCreatorNames(
    event.requestContext.authorizer?.lambda,
    uuid,
    userPoolId
  );

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
  if ("message" in content) {
    return sendError(400, content.message);
  }

  const { title, messageBody } = content;
  const scope = "groups" as const;
  const targets = [slug];
  const createdAt = new Date().toISOString();
  const messageId = nanoid();

  try {
    const choir = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: groupPk(slug), SK: "METADATA" },
        ProjectionExpression: "PK",
      })
    );
    if (!choir.Item) {
      return sendError(404, `Target choir not found: ${slug}.`);
    }

    const canonical = {
      PK: messageCanonicalPk(messageId),
      SK: "META" as const,
      type: "MessageCanonical" as const,
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

    const refSk = messageRefSk(createdAt, messageId);
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: tableName, Item: canonical } },
          {
            Put: {
              TableName: tableName,
              Item: {
                PK: groupPk(slug),
                SK: refSk,
                type: "MessageRef",
                messageId,
                groupSlug: slug,
                createdAt,
              },
            },
          },
        ],
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
        messages: [{ messageId, groupSlug: slug }],
      },
      201
    );
  } catch (err) {
    console.error("createGroupMessage failed", err);
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
    return sendError(500, "Failed to create message.");
  }
};
