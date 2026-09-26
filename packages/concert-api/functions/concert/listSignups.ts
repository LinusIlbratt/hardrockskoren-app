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
  decodeSignupListCursor,
  encodeListCursor,
  SHARED_CONCERT_LIST_DEFAULT_LIMIT,
} from "../lib/keys";
import { parsePathId, toPublicSignup } from "../lib/parse";
import { getSharedConcert, listSignupsPage } from "../lib/store";

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

  const concertId = parsePathId(event.pathParameters?.id);
  if (!concertId) {
    return sendError(400, "Concert id is required in the path.");
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

  let beforeSk: string | null = null;
  if (qs.before !== undefined && qs.before !== null && qs.before !== "") {
    beforeSk = decodeSignupListCursor(qs.before);
    if (!beforeSk) {
      return sendError(400, "before must be a valid signups cursor.");
    }
  }

  try {
    const concert = await getSharedConcert(docClient, tableName, concertId);
    if (!concert) {
      return sendError(404, "Konserten hittades inte.");
    }

    const page = await listSignupsPage(docClient, tableName, concertId, {
      limit,
      beforeSk,
    });

    return sendResponse({
      concertId,
      signupCount:
        typeof concert.signupCount === "number" ? concert.signupCount : 0,
      signups: page.items.map(toPublicSignup),
      hasMore: page.hasMore,
      nextBefore: page.nextBeforeSk
        ? encodeListCursor(page.nextBeforeSk)
        : null,
    });
  } catch (err) {
    console.error("listConcertSignups failed", { concertId, err });
    return sendError(500, "Failed to list concert signups.");
  }
};
