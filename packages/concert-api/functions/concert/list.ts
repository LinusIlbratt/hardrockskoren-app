import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import {
  clampListLimit,
  decodeListCursor,
  encodeListCursor,
  SHARED_CONCERT_LIST_DEFAULT_LIMIT,
} from "../lib/keys";
import { listSharedConcertsPage } from "../lib/store";

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

  const uuid = event.requestContext.authorizer?.lambda?.uuid?.trim();
  if (!uuid) {
    return sendError(401, "User identity is missing from the request context.");
  }

  const qs = event.queryStringParameters ?? {};
  let limit = SHARED_CONCERT_LIST_DEFAULT_LIMIT;
  if (qs.limit !== undefined && qs.limit !== null && qs.limit !== "") {
    const n = Number.parseInt(qs.limit, 10);
    if (!Number.isFinite(n)) {
      return sendError(400, "limit must be an integer.");
    }
    limit = clampListLimit(n);
  }

  let beforeGsi1Sk: string | null = null;
  if (qs.before !== undefined && qs.before !== null && qs.before !== "") {
    beforeGsi1Sk = decodeListCursor(qs.before);
    if (!beforeGsi1Sk) {
      return sendError(400, "before must be a valid list cursor.");
    }
  }

  try {
    const page = await listSharedConcertsPage(docClient, tableName, {
      limit,
      beforeGsi1Sk,
      viewerUuid: uuid,
    });
    return sendResponse({
      concerts: page.items,
      hasMore: page.hasMore,
      nextBefore: page.nextBefore
        ? encodeListCursor(page.nextBefore)
        : null,
    });
  } catch (err) {
    console.error("listSharedConcerts failed", err);
    return sendError(500, "Failed to list shared concerts.");
  }
};
