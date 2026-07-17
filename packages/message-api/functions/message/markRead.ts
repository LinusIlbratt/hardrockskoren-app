import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import {
  requireGroupAccessResponse,
  requireAnyChoirMembershipResponse,
} from "../../../core/utils/requireGroupAccess";
import { ALL_TARGET, messageReadSk } from "../lib/keys";
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

  const uuid = event.requestContext.authorizer?.lambda?.uuid?.trim();
  if (!uuid) {
    return sendError(401, "User identity is missing from the request context.");
  }

  try {
    const meta = await getMessageMeta(docClient, tableName, messageId);
    if (!meta) {
      return sendError(404, "Message not found.");
    }

    const lambdaCtx = event.requestContext.authorizer?.lambda;
    if (meta.groupSlug === ALL_TARGET) {
      const denied = await requireAnyChoirMembershipResponse(lambdaCtx);
      if (denied) return denied;
    } else {
      const denied = await requireGroupAccessResponse(lambdaCtx, meta.groupSlug);
      if (denied) return denied;
    }

    const readAt = new Date().toISOString();
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: `USER#${uuid}`,
          SK: messageReadSk(messageId),
          type: "MessageRead",
          messageId,
          readAt,
        },
      })
    );

    return sendResponse({ ok: true, messageId, readAt });
  } catch (err) {
    console.error("markMessageRead failed", err);
    return sendError(500, "Failed to mark message as read.");
  }
};
