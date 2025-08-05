import { DynamoDBClient, BatchWriteItemCommand, WriteRequest, BatchWriteItemCommandOutput } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;
const BATCH_SIZE = 25;

type AuthorizerContext = {
  role?: string;
};
type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthorizerContext>;

interface EventItem {
    PK: string;
    SK: string;
    eventId: string;
    groupSlug: string;
    title: string;
    eventDate: string;
    endDate: string;
    eventType: 'CONCERT' | 'REHEARSAL';
    description: string | null;
    createdAt: string;
    updatedAt: string; // <-- LADE TILL DENNA RAD
    type: string;
    GSI1PK: string;
    GSI1SK: string;
}

interface BatchCreateBody {
    title: string;
    eventType: 'CONCERT' | 'REHEARSAL';
    description?: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    selectedWeekdays: number[];
}

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    // ... (Behörighetskontroll och validering är oförändrad) ...
    const userRole = event.requestContext.authorizer?.lambda?.role;
    if (!event.body) {
      return sendError(400, "Request body is required.");
    }
    const body: BatchCreateBody = JSON.parse(event.body);
    const { eventType } = body;
    if (userRole === 'admin') {
    } else if (userRole === 'leader') {
      if (eventType !== 'REHEARSAL') {
        return sendError(403, "Forbidden: You only have permission to batch-create rehearsals.");
      }
    } else {
      return sendError(403, "Forbidden: You do not have permission for this action.");
    }
    const { groupSlug } = event.pathParameters || {};
    if (!groupSlug) {
      return sendError(400, "Group slug is required in the path.");
    }
    
    const itemsToCreate: EventItem[] = [];
    let currentDate = new Date(body.startDate);
    const finalDate = new Date(body.endDate);
    const [startHours, startMinutes] = body.startTime.split(':').map(Number);
    const [endHours, endMinutes] = body.endTime.split(':').map(Number);
    const nowISO = new Date().toISOString();

    while (currentDate <= finalDate) {
        if (body.selectedWeekdays.includes(currentDate.getDay())) {
            const eventId = nanoid();
            const eventStartDate = new Date(currentDate);
            eventStartDate.setUTCHours(startHours, startMinutes, 0, 0);
            const eventEndDate = new Date(currentDate);
            eventEndDate.setUTCHours(endHours, endMinutes, 0, 0);
            if (eventEndDate <= eventStartDate) {
                eventEndDate.setDate(eventEndDate.getDate() + 1);
            }

            const item: EventItem = {
                PK: `GROUP#${groupSlug}`,
                SK: `EVENT#${eventId}`,
                eventId,
                groupSlug,
                title: body.title,
                eventDate: eventStartDate.toISOString(),
                endDate: eventEndDate.toISOString(),
                eventType: body.eventType,
                description: body.description || null,
                createdAt: nowISO,
                updatedAt: nowISO, // <-- LADE TILL DENNA RAD
                type: "Event",
                GSI1PK: `GROUP#${groupSlug}`,
                GSI1SK: eventStartDate.toISOString(),
            };
            itemsToCreate.push(item);
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // ... (Resten av funktionen för att skriva till DB är oförändrad) ...
    if (itemsToCreate.length === 0) {
        return sendResponse({ message: "No events were created based on the provided pattern." }, 200);
    }
    const writePromises: Promise<BatchWriteItemCommandOutput>[] = [];
    for (let i = 0; i < itemsToCreate.length; i += BATCH_SIZE) {
        const chunk = itemsToCreate.slice(i, i + BATCH_SIZE);
        const putRequests: WriteRequest[] = chunk.map(item => ({ PutRequest: { Item: marshall(item) } }));
        const command = new BatchWriteItemCommand({ RequestItems: { [MAIN_TABLE]: putRequests } });
        writePromises.push(dbClient.send(command));
    }
    await Promise.all(writePromises);
    return sendResponse({ message: `Successfully created ${itemsToCreate.length} events.`, count: itemsToCreate.length }, 201);

  } catch (error: any) {
    console.error("Error batch creating events:", error);
    if (error.name === 'SyntaxError') {
      return sendError(400, "Invalid JSON format in request body.");
    }
    return sendError(500, error.message || "Internal server error");
  }
};