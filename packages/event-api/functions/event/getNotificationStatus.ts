// functions/events/getNotificationStatus.ts

import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { AuthContext } from "../../../core/types";
import { cognito } from "../../../core/services/cognito";
import middy from "@middy/core";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    if (!MAIN_TABLE) return sendError(500, "Server configuration error.");
    
    try {
      const userContext = event.requestContext.authorizer.lambda;
      const { groupSlug } = event.pathParameters || {};
      if (!groupSlug || !userContext.uuid || !userContext.userPoolId) {
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
      const seenGeneralUpdates: Record<string, string> = seenGeneralAttr?.Value ? JSON.parse(seenGeneralAttr.Value) : {};
      const seenDescriptionUpdates: Record<string, string> = seenDescriptionAttr?.Value ? JSON.parse(seenDescriptionAttr.Value) : {};

      const queryCommand = new QueryCommand({
        TableName: MAIN_TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `GROUP#${groupSlug}` } },
        ProjectionExpression: "eventId, updatedAt, descriptionUpdatedAt, lastUpdatedFields",
      });

      const { Items } = await dbClient.send(queryCommand);
      
      const newEventIds: string[] = [];
      const updatedEvents: Record<string, string[]> = {};

      if (Items && Items.length > 0) {
        const events = Items.map(item => unmarshall(item));
        for (const event of events) {
          if (!event.eventId || !event.updatedAt) continue;

          let isNew = false;
          const actualUpdates: string[] = [];
          
          // Steg 1: Kolla om eventet är nytt
          if (!readEventIds.has(event.eventId)) {
            isNew = true;
            newEventIds.push(event.eventId);
          }
          
          // Steg 2: Kolla ALLTID efter olästa uppdateringar (även för nya event)
          const lastSeenGeneral = seenGeneralUpdates[event.eventId];
          const lastSeenDescription = seenDescriptionUpdates[event.eventId];

          // Har beskrivningen en oläst uppdatering?
          if (event.descriptionUpdatedAt && (!lastSeenDescription || new Date(event.descriptionUpdatedAt) > new Date(lastSeenDescription))) {
            actualUpdates.push('description');
          }

          // Har andra fält en oläst uppdatering? (Körs ej för helt nya event)
          if (!isNew && (!lastSeenGeneral || new Date(event.updatedAt) > new Date(lastSeenGeneral))) {
            const otherFields = (event.lastUpdatedFields || []).filter((field: string) => field !== 'description');
            if (otherFields.length > 0) {
              actualUpdates.push(...otherFields);
            }
          }

          if (actualUpdates.length > 0) {
            updatedEvents[event.eventId] = [...new Set(actualUpdates)];
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
      return sendError(500, error.message || "Internal server error");
    }
  }
);