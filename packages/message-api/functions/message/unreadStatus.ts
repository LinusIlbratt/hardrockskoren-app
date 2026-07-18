import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import { requireGroupAccessResponse } from "../../../core/utils/requireGroupAccess";
import { MESSAGE_FEED_LIMIT } from "../../../core/utils/messageFeed";
import {
  loadFeedForGroup,
  loadReadIds,
  unreadFromFeed,
} from "../lib/feed";

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

  const slug = decodeURIComponent(groupSlug!).trim();
  if (slug.toUpperCase() === "ALL") {
    return sendError(400, 'Use a choir slug in the path; "ALL" is not a feed path.');
  }

  try {
    const { items: messages } = await loadFeedForGroup(
      docClient,
      tableName,
      slug,
      { limit: MESSAGE_FEED_LIMIT }
    );
    const readIds = await loadReadIds(
      docClient,
      tableName,
      uuid,
      messages.map((m) => m.messageId)
    );
    const { hasUnread, unreadCount } = unreadFromFeed(messages, readIds);
    return sendResponse({ hasUnread, unreadCount });
  } catch (err) {
    console.error("unreadStatus failed", err);
    return sendError(500, "Failed to get unread status.");
  }
};
