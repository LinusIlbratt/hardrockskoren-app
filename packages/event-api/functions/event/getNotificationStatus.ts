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

      // UPPDATERAD RAD: Lägg till kontroll för userPoolId här
      if (!groupSlug || !userContext.uuid || !userContext.userPoolId) {
        return sendError(400, "Missing required parameters.");
      }

      // Nu vet TypeScript att userContext.userPoolId är en 'string' på raden nedan
      const { UserAttributes } = await cognito.adminGetUser({
        UserPoolId: userContext.userPoolId,
        Username: userContext.uuid,
      });
      
      const readEventsAttr = UserAttributes?.find(attr => attr.Name === 'custom:readEventIds');
      const seenUpdatesAttr = UserAttributes?.find(attr => attr.Name === 'custom:seenEventUpdates');

      const readEventIds = new Set(readEventsAttr?.Value ? readEventsAttr.Value.split(',') : []);
      const seenEventUpdates: Record<string, string> = seenUpdatesAttr?.Value ? JSON.parse(seenUpdatesAttr.Value) : {};

      const queryCommand = new QueryCommand({
        TableName: MAIN_TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `GROUP#${groupSlug}` } },
        // Vi hämtar inte createdAt längre, men det skadar inte att ha kvar det
        ProjectionExpression: "eventId, createdAt, updatedAt, lastUpdatedFields",
      });

      const { Items } = await dbClient.send(queryCommand);
      
      const newEventIds: string[] = [];
      const updatedEvents: Record<string, string[]> = {};

      if (Items && Items.length > 0) {
        const events = Items.map(item => unmarshall(item));

        for (const event of events) {
          if (!event.eventId || !event.updatedAt) continue;

          if (!readEventIds.has(event.eventId)) {
            newEventIds.push(event.eventId);
            continue;
          }
          
          const lastSeenTimestamp = seenEventUpdates[event.eventId];
          // Vi behöver inte `createdAt` här, så jag tar bort den jämförelsen för renare kod
          if (!lastSeenTimestamp || new Date(event.updatedAt) > new Date(lastSeenTimestamp)) {
            updatedEvents[event.eventId] = event.lastUpdatedFields || [];
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