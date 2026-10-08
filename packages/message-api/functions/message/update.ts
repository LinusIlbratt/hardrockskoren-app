import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import { messageCanonicalPk } from "../lib/keys";
import { getCanonicalMessage } from "../lib/feed";
import { evaluateMessageOwnership } from "../lib/ownership";

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
  if (!tableName) {
    return sendError(500, "Server configuration error.");
  }

  const messageId = event.pathParameters?.messageId?.trim();
  if (!messageId) {
    return sendError(400, "messageId is required in the path.");
  }

  const auth = event.requestContext.authorizer?.lambda;
  const callerUuid = auth?.uuid?.trim();

  try {
    const message = await getCanonicalMessage(docClient, tableName, messageId);
    if (!message) {
      return sendError(404, "Message not found.");
    }

    const ownership = evaluateMessageOwnership(
      auth?.role,
      callerUuid,
      message.createdByUuid
    );
    if ("statusCode" in ownership) {
      if (ownership.statusCode === 401) {
        return sendError(401, "User identity is missing from the request context.");
      }
      return sendError(403, "Du kan bara redigera dina egna meddelanden");
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
    if ("message" in content) {
      return sendError(400, content.message);
    }

    const { title, messageBody } = content;
    const updatedAt = new Date().toISOString();

    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: messageCanonicalPk(messageId), SK: "META" },
        UpdateExpression: "SET title = :title, body = :body, updatedAt = :updatedAt",
        ConditionExpression: "attribute_exists(PK) AND attribute_exists(SK)",
        ExpressionAttributeValues: {
          ":title": title,
          ":body": messageBody,
          ":updatedAt": updatedAt,
        },
      })
    );

    return sendResponse({
      messageId,
      title,
      body: messageBody,
      createdAt: message.createdAt,
      updatedAt,
      createdByUuid: message.createdByUuid,
      ...(message.createdByName ? { createdByName: message.createdByName } : {}),
      ...(message.createdByGivenName
        ? { createdByGivenName: message.createdByGivenName }
        : {}),
      scope: message.scope,
      targets: message.targets,
    });
  } catch (err) {
    console.error("updateMessage failed", err);
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    if (name === "ConditionalCheckFailedException") {
      return sendError(404, "Message not found.");
    }
    return sendError(500, "Failed to update message.");
  }
};
