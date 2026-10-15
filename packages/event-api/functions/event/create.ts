import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import { requireGroupAccessResponse } from "../../../core/utils/requireGroupAccess";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 5000;

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

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

    if (userRole !== "admin" && userRole !== "leader") {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    const { groupSlug } = event.pathParameters || {};
    const authDenied = await requireGroupAccessResponse(
      event.requestContext.authorizer?.lambda,
      groupSlug
    );
    if (authDenied) return authDenied;

    if (typeof title !== "string" || title.trim() === "" || !eventDate || !endDate || !eventType) {
      return sendError(400, "title, eventDate, endDate, and eventType are required.");
    }
    const trimmedTitle = title.trim();
    if (trimmedTitle.length > TITLE_MAX) {
      return sendError(400, "title får vara högst 150 tecken.");
    }
    if (description != null && typeof description !== "string") {
      return sendError(400, "description måste vara en text.");
    }
    if (typeof description === "string" && description.length > DESCRIPTION_MAX) {
      return sendError(400, "description får vara högst 5000 tecken.");
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
      title: trimmedTitle,
      eventDate: isoStartDate,
      endDate: isoEndDate,
      eventType,
      description: description || null,
      createdAt: nowISO,
      updatedAt: nowISO,
      // NY LOGIK: Sätt tidsstämpel för beskrivningen endast om den finns
      descriptionUpdatedAt: description ? nowISO : null,
      lastUpdatedFields: [],
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
    return sendError(500, "Ett internt serverfel uppstod");
  }
};