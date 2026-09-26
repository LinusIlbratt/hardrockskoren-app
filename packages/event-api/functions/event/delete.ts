import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import { requireGroupAccessResponse } from "../../../core/utils/requireGroupAccess";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    const userRole = event.requestContext.authorizer?.lambda?.role;
    if (userRole !== 'admin') {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    const { groupSlug, eventId } = event.pathParameters || {};
    if (!eventId) {
      return sendError(400, "Group slug and event ID are required in the path.");
    }

    const authDenied = await requireGroupAccessResponse(
      event.requestContext.authorizer?.lambda,
      groupSlug
    );
    if (authDenied) return authDenied;

    const command = new DeleteItemCommand({
        TableName: MAIN_TABLE,
        Key: marshall({
            PK: `GROUP#${groupSlug}`,
            SK: `EVENT#${eventId}`
        }),
        ConditionExpression: "attribute_exists(PK)"
    });

    await dbClient.send(command);

    return sendResponse({ message: "Event deleted successfully." }, 200);

  } catch (error: any) {
    console.error("Error deleting event:", error);

    // Om vår ConditionExpression misslyckas betyder det att objektet inte fanns.
    if (error.name === 'ConditionalCheckFailedException') {
        return sendError(404, "Not Found: The event you are trying to delete does not exist.");
    }
    
    return sendError(500, error.message || "Internal server error");
  }
};