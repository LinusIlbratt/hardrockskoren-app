import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import { ALL_TARGET, messageMetaPk, normalizeTarget } from "../lib/keys";
import { getMessageMeta } from "../lib/feed";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

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

  const querySlug = normalizeTarget(event.queryStringParameters?.groupSlug);

  try {
    const meta = await getMessageMeta(docClient, tableName, messageId);
    if (!meta) {
      return sendError(404, "Message not found.");
    }

    if (querySlug && querySlug !== meta.groupSlug) {
      return sendError(400, "groupSlug query does not match message target.");
    }

    // Confirm message row still exists
    const existing = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: meta.targetPk, SK: meta.targetSk },
      })
    );
    if (!existing.Item) {
      // Clean orphan meta
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { PK: messageMetaPk(messageId), SK: "META" },
        })
      );
      return sendError(404, "Message not found.");
    }

    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { PK: meta.targetPk, SK: meta.targetSk },
      })
    );
    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { PK: messageMetaPk(messageId), SK: "META" },
      })
    );

    return sendResponse({
      ok: true,
      messageId,
      groupSlug: meta.groupSlug === ALL_TARGET ? ALL_TARGET : meta.groupSlug,
    });
  } catch (err) {
    console.error("deleteMessage failed", err);
    return sendError(500, "Failed to delete message.");
  }
};
