import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import {
  clampMessageFeedLimit,
  parseMessageFeedCursor,
  MESSAGE_FEED_PAGE_SIZE,
} from "../../../core/utils/messageFeed";
import { listSentMessages } from "../lib/feed";

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
    const page = await listSentMessages(docClient, tableName, {
      limit,
      before,
    });
    return sendResponse({
      messages: page.items.map((m) => ({
        messageId: m.messageId,
        title: m.title,
        body: m.body,
        createdAt: m.createdAt,
        createdByUuid: m.createdByUuid,
        createdByName: m.createdByName,
        scope: m.scope,
        targets: m.targets,
      })),
      hasMore: page.hasMore,
    });
  } catch (err) {
    console.error("listSentMessages failed", err);
    return sendError(500, "Failed to list sent messages.");
  }
};
