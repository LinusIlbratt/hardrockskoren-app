// functions/event/batch.ts

import { DynamoDBClient, BatchWriteItemCommand, WriteRequest } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import { requireGroupAccessResponse } from "../../../core/utils/requireGroupAccess";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;
const BATCH_SIZE = 25;
const MAX_RANGE_DAYS = 90;
const MAX_EVENTS_PER_REQUEST = 60;
const MAX_WRITE_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** YYYY-MM-DD as UTC midnight. Rejects impossible calendar dates. */
function utcDay(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return utc;
}

async function putEventChunk(tableName: string, requests: WriteRequest[]): Promise<void> {
  let pending = requests;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS && pending.length > 0; attempt += 1) {
    if (attempt > 0) {
      await sleep(50 * 2 ** attempt);
    }
    const result = await dbClient.send(
      new BatchWriteItemCommand({
        RequestItems: { [tableName]: pending },
      })
    );
    pending = result.UnprocessedItems?.[tableName] ?? [];
  }
  if (pending.length > 0) {
    throw new Error("Kunde inte skriva alla händelser.");
  }
}

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

// STEG 1: Lägg till det nya fältet i interfacet
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
    updatedAt: string;
    descriptionUpdatedAt: string | null;
    lastUpdatedFields: string[];
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
    const userRole = event.requestContext.authorizer?.lambda?.role;
    if (!event.body) {
      return sendError(400, "Request body is required.");
    }
    const body: BatchCreateBody = JSON.parse(event.body);
    if (userRole !== "admin" && userRole !== "leader") {
      return sendError(403, "Forbidden: You do not have permission for this action.");
    }
    if (body.eventType !== "CONCERT" && body.eventType !== "REHEARSAL") {
      return sendError(400, "eventType must be either 'CONCERT' or 'REHEARSAL'.");
    }
    const { groupSlug } = event.pathParameters || {};
    const authDenied = await requireGroupAccessResponse(
      event.requestContext.authorizer?.lambda,
      groupSlug
    );
    if (authDenied) return authDenied;

    const rangeStart = utcDay(body.startDate);
    const rangeEnd = utcDay(body.endDate);
    if (rangeStart === null || rangeEnd === null || rangeEnd < rangeStart) {
      return sendError(400, "Ogiltigt datumintervall.");
    }
    const rangeDays = Math.round((rangeEnd - rangeStart) / (24 * 60 * 60 * 1000));
    if (rangeDays > MAX_RANGE_DAYS) {
      return sendError(400, "Datumintervallet får vara högst 90 dagar.");
    }
    if (!Array.isArray(body.selectedWeekdays) || typeof body.startTime !== "string" || typeof body.endTime !== "string") {
      return sendError(400, "startTime, endTime och selectedWeekdays krävs.");
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

            // STEG 2: Lägg till den nya logiken när item-objektet skapas
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
                lastUpdatedFields: [],
                createdAt: nowISO,
                updatedAt: nowISO,
                descriptionUpdatedAt: body.description ? nowISO : null, // Ny logik
                type: "Event",
                GSI1PK: `GROUP#${groupSlug}`,
                GSI1SK: eventStartDate.toISOString(),
            };
            itemsToCreate.push(item);
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (itemsToCreate.length === 0) {
        return sendResponse({ message: "No events were created based on the provided pattern." }, 200);
    }
    if (itemsToCreate.length > MAX_EVENTS_PER_REQUEST) {
      return sendError(400, "Högst 60 händelser kan skapas åt gången.");
    }
    for (let i = 0; i < itemsToCreate.length; i += BATCH_SIZE) {
        const chunk = itemsToCreate.slice(i, i + BATCH_SIZE);
        const putRequests: WriteRequest[] = chunk.map(item => ({ PutRequest: { Item: marshall(item) } }));
        await putEventChunk(MAIN_TABLE, putRequests);
    }
    return sendResponse({ message: `Successfully created ${itemsToCreate.length} events.`, count: itemsToCreate.length }, 201);

  } catch (error: any) {
    console.error("Error batch creating events:", error);
    if (error.name === 'SyntaxError') {
      return sendError(400, "Invalid JSON format in request body.");
    }
    return sendError(500, "Ett internt serverfel uppstod");
  }
};