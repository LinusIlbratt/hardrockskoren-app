import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

// Definierar hur event-objektet ser ut efter att vår authorizer har kört
type AuthorizedEvent = APIGatewayProxyEvent & {
  requestContext: { authorizer: { lambda: { role?: string } } }
};

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
    
    // Steg 2: Hämta data från anropet
    const { groupName } = event.pathParameters || {};
    if (!groupName) {
      return sendError(400, "Group name is required in the path.");
    }
    
    if (!event.body) {
      return sendError(400, "Request body is required.");
    }
    const { title } = JSON.parse(event.body);
    if (!title) {
        return sendError(400, "Title is required in the request body.");
    }

    // Steg 3: Skapa det nya repertoar-objektet
    const repertoireId = nanoid();
    const item = {
      PK: `GROUP#${groupName}`,
      SK: `REPERTOIRE#${repertoireId}`,
      repertoireId,
      title,
      createdAt: new Date().toISOString(),
      type: "Repertoire",
    };

    // Steg 4: Spara objektet i DynamoDB
    const command = new PutItemCommand({
      TableName: MAIN_TABLE,
      Item: marshall(item),
    });

    await dbClient.send(command);

    return sendResponse({ message: "Repertoire item created.", item }, 201);

  } catch (error: any) {
    console.error("Error creating repertoire item:", error);
    return sendError(500, error.message || "Internal server error");
  }
};