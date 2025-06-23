import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";

// Samma typdefinition som i create/update för att hantera authorizer-kontexten
type AuthorizerContext = {
  role?: string;
};
type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>;

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    // Steg 1: Verifiera att användaren är admin
    const userRole = event.requestContext.authorizer?.lambda?.role;
    if (userRole !== 'admin') {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    // Steg 2: Hämta identifierare från sökvägen
    const { groupSlug, eventId } = event.pathParameters || {};
    if (!groupSlug || !eventId) {
      return sendError(400, "Group slug and event ID are required in the path.");
    }
    
    // Steg 3: Bygg upp ett Delete-kommando
    const command = new DeleteItemCommand({
        TableName: MAIN_TABLE,
        // Definierar primärnyckeln för objektet som ska raderas
        Key: marshall({
            PK: `GROUP#${groupSlug}`,
            SK: `EVENT#${eventId}`
        }),
        // (Valfritt men rekommenderat) Säkerställer att objektet finns innan vi försöker radera det.
        // Om det inte finns, kastas ett fel som vi kan fånga och returnera 404 Not Found.
        ConditionExpression: "attribute_exists(PK)"
    });

    // Steg 4: Skicka kommandot till DynamoDB
    await dbClient.send(command);

    // Skicka ett framgångsmeddelande. Status 200 eller 204 No Content är vanligt för DELETE.
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