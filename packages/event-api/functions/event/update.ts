// functions/event/update.ts

import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";

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
    const userRole = event.requestContext.authorizer?.lambda?.role;
    if (userRole !== 'admin' && userRole !== 'leader') {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    const { groupSlug, eventId } = event.pathParameters || {};
    if (!groupSlug || !eventId) {
      return sendError(400, "Group slug and event ID are required in the path.");
    }

    if (!event.body) {
      return sendError(400, "Request body with fields to update is required.");
    }
    const updatesFromClient = JSON.parse(event.body);
    if (Object.keys(updatesFromClient).length === 0) {
        return sendError(400, "Request body cannot be empty.");
    }

    // --- NY SMART LOGIK START ---

    // STEG 1: Hämta det befintliga eventet från databasen
    const getCommand = new GetItemCommand({
        TableName: MAIN_TABLE,
        Key: marshall({
            PK: `GROUP#${groupSlug}`,
            SK: `EVENT#${eventId}`
        })
    });
    const { Item: existingItemRaw } = await dbClient.send(getCommand);

    if (!existingItemRaw) {
        return sendError(404, "Event not found.");
    }
    const existingEvent = unmarshall(existingItemRaw);

    // STEG 2: Jämför fälten från klienten med de som redan finns i databasen
    const actualChangedFields: string[] = [];
    for (const key in updatesFromClient) {
        // Jämför bara om fältet finns i båda objekten
        if (Object.prototype.hasOwnProperty.call(updatesFromClient, key)) {
            // Om värdet från klienten är annorlunda än det i databasen, är det en verklig ändring.
            if (updatesFromClient[key] !== existingEvent[key]) {
                actualChangedFields.push(key);
            }
        }
    }

    // Om inga fält faktiskt ändrades, behöver vi inte göra en uppdatering.
    if (actualChangedFields.length === 0) {
        return sendResponse({ message: "No actual changes detected.", item: existingEvent }, 200);
    }
    
    // --- NY SMART LOGIK SLUT ---

    // Bygg upp det slutgiltiga uppdateringsobjektet
    const updates: Record<string, any> = {};
    for (const key of actualChangedFields) {
        updates[key] = updatesFromClient[key];
    }
    
    const nowISO = new Date().toISOString();
    updates.updatedAt = nowISO;
    updates.lastUpdatedFields = actualChangedFields; // Använd den nya, korrekta listan

    if (actualChangedFields.includes('description')) {
        updates.descriptionUpdatedAt = nowISO;
    }

    if (actualChangedFields.includes('eventDate')) {
        updates.GSI1SK = new Date(updates.eventDate).toISOString();
    }
    
    const updateKeys = Object.keys(updates);

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
        ReturnValues: "ALL_NEW",
    });

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