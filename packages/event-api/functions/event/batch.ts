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

// ✅ ÄNDRING: Lade till endDate
interface EventItem {
    PK: string;
    SK: string;
    eventId: string;
    groupSlug: string;
    title: string;
    eventDate: string;  // Detta blir nu starttiden
    endDate: string;    // Detta blir sluttiden
    eventType: 'CONCERT' | 'REHEARSAL';
    description: string | null;
    createdAt: string;
    type: string;
    GSI1PK: string;
    GSI1SK: string;
}

// ✅ ÄNDRING: Uppdaterad för att matcha formuläret
interface BatchCreateBody {
    title: string;
    eventType: 'CONCERT' | 'REHEARSAL';
    description?: string;
    startDate: string;
    endDate: string;
    startTime: string; // Bytte från 'time'
    endTime: string;   // Lade till 'endTime'
    selectedWeekdays: number[];
}

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    const userRole = event.requestContext.authorizer?.lambda?.role;
    
    if (!event.body) {
      return sendError(400, "Request body is required.");
    }
    
    const body: BatchCreateBody = JSON.parse(event.body);
    const { eventType } = body;

    if (userRole === 'admin') {
      // Admins får fortsätta
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
    
    // ✅ ÄNDRING: Hämta både start- och sluttid
    const [startHours, startMinutes] = body.startTime.split(':').map(Number);
    const [endHours, endMinutes] = body.endTime.split(':').map(Number);

    while (currentDate <= finalDate) {
        if (body.selectedWeekdays.includes(currentDate.getDay())) {
            const eventId = nanoid();

            // Skapa startdatum och tid
            const eventStartDate = new Date(currentDate);
            eventStartDate.setUTCHours(startHours, startMinutes, 0, 0);

            // Skapa slutdatum och tid
            const eventEndDate = new Date(currentDate);
            eventEndDate.setUTCHours(endHours, endMinutes, 0, 0);

            // Hantera event som går över midnatt (t.ex. 22:00 - 01:00)
            if (eventEndDate <= eventStartDate) {
                eventEndDate.setDate(eventEndDate.getDate() + 1);
            }

            const item: EventItem = {
                PK: `GROUP#${groupSlug}`,
                SK: `EVENT#${eventId}`,
                eventId,
                groupSlug,
                title: body.title,
                eventDate: eventStartDate.toISOString(), // Starttid
                endDate: eventEndDate.toISOString(),     // Sluttid
                eventType: body.eventType,
                description: body.description || null,
                createdAt: new Date().toISOString(),
                type: "Event",
                GSI1PK: `GROUP#${groupSlug}`,
                GSI1SK: eventStartDate.toISOString(), // Sortera på starttid
            };
            itemsToCreate.push(item);
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (itemsToCreate.length === 0) {
        return sendResponse({ message: "No events were created based on the provided pattern." }, 200);
    }

    const writePromises: Promise<BatchWriteItemCommandOutput>[] = [];
    
    for (let i = 0; i < itemsToCreate.length; i += BATCH_SIZE) {
        const chunk = itemsToCreate.slice(i, i + BATCH_SIZE);
        
        const putRequests: WriteRequest[] = chunk.map(item => ({
            PutRequest: {
                Item: marshall(item),
            },
        }));

        const command = new BatchWriteItemCommand({
            RequestItems: {
                [MAIN_TABLE]: putRequests,
            },
        });
        
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