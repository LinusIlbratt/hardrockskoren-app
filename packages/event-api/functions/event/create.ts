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
    // Steg 1: Verifiera att användaren är admin
    const userRole = event.requestContext.authorizer?.lambda?.role;
    if (userRole !== 'admin') {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }
    
    // Steg 2: Hämta data från anropet
    const { groupSlug } = event.pathParameters || {};
    if (!groupSlug) {
      return sendError(400, "Group slug is required in the path.");
    }
    
    if (!event.body) {
      return sendError(400, "Request body is required.");
    }
    const { title, eventDate, eventType, description } = JSON.parse(event.body);
    if (!title || !eventDate || !eventType) {
      return sendError(400, "title, eventDate, and eventType are required.");
    }
    if (eventType !== 'CONCERT' && eventType !== 'REHEARSAL') {
      return sendError(400, "eventType must be either 'CONCERT' or 'REHEARSAL'.");
    }

    // Steg 3: Skapa det nya event-objektet
    const eventId = nanoid();
    const isoDate = new Date(eventDate).toISOString();

    const item = {
      PK: `GROUP#${groupSlug}`,
      SK: `EVENT#${eventId}`,
      eventId,
      groupSlug,
      title,
      eventDate: isoDate,
      eventType,
      description: description || null, // Beskrivning är valfri
      createdAt: new Date().toISOString(),
      type: "Event",      
      GSI1PK: `GROUP#${groupSlug}`, // Samma som PK, för att kunna fråga på grupp i GSI:t
      GSI1SK: isoDate,   
    };

    // Steg 4: Spara objektet i DynamoDB
    const command = new PutItemCommand({
      TableName: MAIN_TABLE,
      Item: marshall(item),
    });

    await dbClient.send(command);

    return sendResponse({ message: "Event created successfully.", item }, 201);

  } catch (error: any) {
    console.error("Error creating event:", error);
    return sendError(500, error.message || "Internal server error");
  }
};