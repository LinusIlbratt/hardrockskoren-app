import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";

// Samma typdefinition som i create.ts för att hantera authorizer-kontexten
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

    // Steg 2: Hämta identifierare från sökvägen och data från body
    const { groupSlug, eventId } = event.pathParameters || {};
    if (!groupSlug || !eventId) {
      return sendError(400, "Group slug and event ID are required in the path.");
    }

    if (!event.body) {
      return sendError(400, "Request body with fields to update is required.");
    }
    const updates = JSON.parse(event.body);
    if (Object.keys(updates).length === 0) {
        return sendError(400, "Request body cannot be empty.");
    }
    
    // Förhindra att man försöker uppdatera primärnycklar eller fasta ID:n
    delete updates.PK;
    delete updates.SK;
    delete updates.GSI1PK; // GSI1PK är baserad på groupSlug och ska inte kunna ändras direkt
    delete updates.eventId;
    delete updates.groupSlug;
    delete updates.type;
    delete updates.createdAt;

    // VIKTIGT: Om eventDate uppdateras, se till att GSI1SK (sorteringsnyckeln) också uppdateras!
    if (updates.eventDate) {
        const isoDate = new Date(updates.eventDate).toISOString();
        updates.eventDate = isoDate; // Säkerställ ISO-format
        updates.GSI1SK = isoDate;  // Spegla värdet till GSI-sorteringsnyckeln
    }
    
    // Steg 3: Bygg upp Update-kommandot dynamiskt
    const updateKeys = Object.keys(updates);

    // Om inga giltiga fält finns kvar att uppdatera, returnera ett fel.
    if (updateKeys.length === 0) {
        return sendError(400, "No valid fields to update were provided.");
    }

    const command = new UpdateItemCommand({
        TableName: MAIN_TABLE,
        Key: marshall({
            PK: `GROUP#${groupSlug}`,
            SK: `EVENT#${eventId}`
        }),
        UpdateExpression: `SET ${updateKeys.map(key => `#${key} = :${key}`).join(", ")}`,
        ExpressionAttributeNames: updateKeys.reduce((acc, key) => {
            acc[`#${key}`] = key;
            return acc;
        }, {} as Record<string, string>),
        ExpressionAttributeValues: marshall(updateKeys.reduce((acc, key) => {
            acc[`:${key}`] = updates[key];
            return acc;
        }, {} as Record<string, any>)),
        ReturnValues: "ALL_NEW", // Returnera hela det uppdaterade objektet
    });

    // Steg 4: Skicka kommandot och returnera det uppdaterade objektet
    const result = await dbClient.send(command);
    const updatedItem = result.Attributes ? unmarshall(result.Attributes) : null;

    return sendResponse({ message: "Event updated successfully.", item: updatedItem }, 200);

  } catch (error: any) {
    console.error("Error updating event:", error);
    if (error.name === 'SyntaxError') {
        return sendError(400, "Invalid JSON in request body.");
    }
    return sendError(500, error.message || "Internal server error");
  }
};