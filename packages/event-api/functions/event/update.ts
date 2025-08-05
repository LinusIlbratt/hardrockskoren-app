// functions/event/update.ts

import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
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
    // ÄNDRING: Tillåt även 'leader' att uppdatera events
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
    const updates = JSON.parse(event.body);
    if (Object.keys(updates).length === 0) {
        return sendError(400, "Request body cannot be empty.");
    }
    
    // Förhindra att man försöker uppdatera skyddade fält
    delete updates.PK;
    delete updates.SK;
    delete updates.GSI1PK;
    delete updates.eventId;
    delete updates.groupSlug;
    delete updates.type;
    delete updates.createdAt;
    delete updates.updatedAt; // Se till att en användare inte kan skicka in ett eget 'updatedAt'
    
    // ÄNDRING: Tvinga alltid en ny 'updatedAt'-stämpel vid varje uppdatering
    updates.updatedAt = new Date().toISOString();

    if (updates.eventDate) {
        const isoDate = new Date(updates.eventDate).toISOString();
        updates.eventDate = isoDate;
        updates.GSI1SK = isoDate;
    }
    
    const updateKeys = Object.keys(updates);

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