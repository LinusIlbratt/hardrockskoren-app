// functions/events/getNotificationStatus.ts

import { AttributeValue, DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { AuthContext } from "../../../core/types";
import { cognito } from "../../../core/services/cognito";
import { requireGroupAccessResponse } from "../../../core/utils/requireGroupAccess";
import middy from "@middy/core";
import { isNotificationWindowClosed } from "./notificationWindow";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;
const MAX_QUERY_PAGES = 200;

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

/** Cognito custom:seen* — ogiltig JSON ska inte fälla hela notisstatusen. */
function parseSeenTimestampMap(
  raw: string | undefined,
  attributeName: string
): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn(
        `getNotificationStatus: ${attributeName} is not a JSON object; treating as empty.`
      );
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key === "string" && typeof value === "string") {
        out[key] = value;
      }
    }
    return out;
  } catch (err) {
    console.warn(
      `getNotificationStatus: failed to parse ${attributeName}; treating as empty.`,
      err
    );
    return {};
  }
}

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    if (!MAIN_TABLE) return sendError(500, "Server configuration error.");
    
    try {
      const userContext = event.requestContext.authorizer.lambda;
      const { groupSlug } = event.pathParameters || {};
      const authDenied = await requireGroupAccessResponse(userContext, groupSlug);
      if (authDenied) return authDenied;

      if (!userContext.uuid || !userContext.userPoolId) {
        return sendError(400, "Missing required parameters.");
      }

      const { UserAttributes } = await cognito.adminGetUser({
        UserPoolId: userContext.userPoolId,
        Username: userContext.uuid,
      });
      
      const readEventsAttr = UserAttributes?.find(attr => attr.Name === 'custom:readEventIds');
      const seenGeneralAttr = UserAttributes?.find(attr => attr.Name === 'custom:seenGenUpd');
      const seenDescriptionAttr = UserAttributes?.find(attr => attr.Name === 'custom:seenDescUpd');

      const readEventIds = new Set(readEventsAttr?.Value ? readEventsAttr.Value.split(',') : []);
      const seenGeneralUpdates = parseSeenTimestampMap(
        seenGeneralAttr?.Value,
        "custom:seenGenUpd"
      );
      const seenDescriptionUpdates = parseSeenTimestampMap(
        seenDescriptionAttr?.Value,
        "custom:seenDescUpd"
      );

      const events: Record<string, any>[] = [];
      let startKey: Record<string, AttributeValue> | undefined;
      let pages = 0;

      do {
        if (pages >= MAX_QUERY_PAGES) {
          console.error("getNotificationStatus: query page limit reached", { groupSlug, pages });
          return sendError(500, "Kunde inte hämta hela notisunderlaget.");
        }
        const result = await dbClient.send(
          new QueryCommand({
            TableName: MAIN_TABLE,
            IndexName: "GSI1",
            KeyConditionExpression: "GSI1PK = :pk",
            ExpressionAttributeValues: { ":pk": { S: `GROUP#${groupSlug}` } },
            ProjectionExpression:
              "eventId, updatedAt, descriptionUpdatedAt, lastUpdatedFields, eventDate, endDate, eventType",
            ExclusiveStartKey: startKey,
          })
        );
        for (const item of result.Items ?? []) {
          events.push(unmarshall(item));
        }
        startKey = result.LastEvaluatedKey;
        pages += 1;
      } while (startKey);
      
      const newEventIds: string[] = [];
      const updatedEvents: Record<string, string[]> = {};
      const now = new Date();

      if (events.length > 0) {
        for (const calendarEvent of events) {
          if (!calendarEvent.eventId || !calendarEvent.updatedAt) continue;
          if (isNotificationWindowClosed(calendarEvent, now)) continue;

          let isNew = false;
          const actualUpdates: string[] = [];
          
          // Steg 1: Kolla om eventet är nytt
          if (!readEventIds.has(calendarEvent.eventId)) {
            isNew = true;
            newEventIds.push(calendarEvent.eventId);
          }
          
          // Steg 2: Kolla ALLTID efter olästa uppdateringar (även för nya event)
          const lastSeenGeneral = seenGeneralUpdates[calendarEvent.eventId];
          const lastSeenDescription = seenDescriptionUpdates[calendarEvent.eventId];

          // Har beskrivningen en oläst uppdatering?
          if (calendarEvent.descriptionUpdatedAt && (!lastSeenDescription || new Date(calendarEvent.descriptionUpdatedAt) > new Date(lastSeenDescription))) {
            actualUpdates.push('description');
          }

          // Har andra fält en oläst uppdatering? (Körs ej för helt nya event)
          if (!isNew && (!lastSeenGeneral || new Date(calendarEvent.updatedAt) > new Date(lastSeenGeneral))) {
            const lastUpdatedFields = calendarEvent.lastUpdatedFields;
            const otherFields = Array.isArray(lastUpdatedFields)
              ? lastUpdatedFields.filter(
                  (field: unknown) =>
                    typeof field === "string" && field !== "description"
                )
              : [];
            if (otherFields.length > 0) {
              actualUpdates.push(...otherFields);
            }
          }

          if (actualUpdates.length > 0) {
            updatedEvents[calendarEvent.eventId] = [...new Set(actualUpdates)];
          }
        }
      }

      const hasNotification = newEventIds.length > 0 || Object.keys(updatedEvents).length > 0;

      return sendResponse({ 
        hasNotification,
        newEventIds,
        updatedEvents 
      }, 200);

    } catch (error: any) {
      console.error("Error checking notification status:", error);
      return sendError(500, "Ett internt serverfel uppstod");
    }
  }
);