import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import { parsePathId } from "../lib/parse";
import { deleteSharedConcertCascade } from "../lib/store";

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

  try {
    const result = await deleteSharedConcertCascade(
      docClient,
      tableName,
      concertId
    );
    if (!result) {
      return sendError(404, "Konserten hittades inte.");
    }

    return sendResponse({
      ok: true,
      concertId,
      deletedSignupCount: result.deletedSignupCount,
    });
  } catch (err) {
    console.error("deleteSharedConcert failed", { concertId, err });
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    if (name === "ConditionalCheckFailedException") {
      return sendError(404, "Konserten hittades inte.");
    }
    return sendError(500, "Failed to delete shared concert.");
  }
};
