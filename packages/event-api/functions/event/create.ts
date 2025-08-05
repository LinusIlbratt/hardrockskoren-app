import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

type AuthorizerContext = {
  role?: string;
};

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>;

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { eventType, title, eventDate, endDate, description } = body;
    const userRole = event.requestContext.authorizer?.lambda?.role;

    // ... (Behörighetskontroll är oförändrad) ...
    if (userRole === 'admin') {
    } else if (userRole === 'leader') {
      if (eventType !== 'REHEARSAL') {
        return sendError(403, "Forbidden: You only have permission to create rehearsals.");
      }
    } else {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    const { groupSlug } = event.pathParameters || {};
    if (!groupSlug) {
      return sendError(400, "Group slug is required in the path.");
    }
    if (!title || !eventDate || !endDate || !eventType) {
      return sendError(400, "title, eventDate, endDate, and eventType are required.");
    }
    if (eventType !== 'CONCERT' && eventType !== 'REHEARSAL') {
      return sendError(400, "eventType must be either 'CONCERT' or 'REHEARSAL'.");
    }

    const eventId = nanoid();
    const nowISO = new Date().toISOString();
    const isoStartDate = new Date(eventDate).toISOString();
    const isoEndDate = new Date(endDate).toISOString();

    const item = {
      PK: `GROUP#${groupSlug}`,
      SK: `EVENT#${eventId}`,
      eventId,
      groupSlug,
      title,
      eventDate: isoStartDate,
      endDate: isoEndDate,
      eventType,
      description: description || null,
      createdAt: nowISO,
      updatedAt: nowISO, // <-- LADE TILL DENNA RAD
      type: "Event",
      GSI1PK: `GROUP#${groupSlug}`,
      GSI1SK: isoStartDate,
    };

    const command = new PutItemCommand({
      TableName: MAIN_TABLE,
      Item: marshall(item),
    });

    await dbClient.send(command);

    return sendResponse({ message: "Event created successfully.", item }, 201);

  } catch (error: any) {
    console.error("Error creating event:", error);
    if (error.name === 'SyntaxError') {
      return sendError(400, "Invalid JSON format in request body.");
    }
    return sendError(500, error.message || "Internal server error");
  }
};