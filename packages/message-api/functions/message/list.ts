import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import { requireGroupAccessResponse } from "../../../core/utils/requireGroupAccess";
import {
  clampMessageFeedLimit,
  parseMessageFeedCursor,
  MESSAGE_FEED_PAGE_SIZE,
} from "../../../core/utils/messageFeed";
import { loadFeedForGroup, loadReadIds, toFeedResponse } from "../lib/feed";
import { enrichItemsWithSenderNames } from "../lib/senderNames";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

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

  const slug = decodeURIComponent(groupSlug!).trim();
  if (slug.toUpperCase() === "ALL") {
    return sendError(400, 'Use a choir slug in the path; "ALL" is not a feed path.');
  }

  const qs = event.queryStringParameters ?? {};
  let limit = MESSAGE_FEED_PAGE_SIZE;
  if (qs.limit !== undefined && qs.limit !== null && qs.limit !== "") {
    const n = Number.parseInt(qs.limit, 10);
    if (!Number.isFinite(n)) {
      return sendError(400, "limit must be an integer.");
    }
    limit = clampMessageFeedLimit(n, MESSAGE_FEED_PAGE_SIZE);
  }

  const before = parseMessageFeedCursor(qs.before);
  if (qs.before && !before) {
    return sendError(
      400,
      'before must be a cursor like "{createdAt}#{messageId}".'
    );
  }

  try {
    const page = await loadFeedForGroup(docClient, tableName, slug, {
      limit,
      before,
    });
    const itemsWithSender = await enrichItemsWithSenderNames(page.items, {
      userPoolId,
      docClient,
      tableName,
    });
    const readIds = await loadReadIds(
      docClient,
      tableName,
      uuid,
      itemsWithSender.map((m) => m.messageId)
    );
    return sendResponse({
      messages: toFeedResponse(itemsWithSender, readIds),
      hasMore: page.hasMore,
    });
  } catch (err) {
    console.error("listMessages failed", err);
    return sendError(500, "Failed to list messages.");
  }
};
