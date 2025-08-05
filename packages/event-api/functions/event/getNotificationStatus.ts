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
    if (!MAIN_TABLE) {
      return sendError(500, "Server configuration error: Table name not set.");
    }

    try {
      const userContext = event.requestContext.authorizer.lambda;
      const { groupSlug } = event.pathParameters || {};

      if (!groupSlug) return sendError(400, "Group slug is required in the path.");
      if (!userContext.uuid || !userContext.userPoolId) return sendError(400, "User context is missing.");

      // Hämta användarens senast sedda status från Cognito
      const { UserAttributes } = await cognito.adminGetUser({
        UserPoolId: userContext.userPoolId,
        Username: userContext.uuid,
      });
      
      const readEventsAttr = UserAttributes?.find(attr => attr.Name === 'custom:readEventIds');
      const lastViewedAttr = UserAttributes?.find(attr => attr.Name === 'custom:eventsLastViewedAt');

      const readEventIds = new Set(readEventsAttr?.Value ? readEventsAttr.Value.split(',') : []);
      const userLastViewedTimestamp = lastViewedAttr?.Value ? new Date(lastViewedAttr.Value) : new Date(0); // Sätt till en tidig startpunkt om värdet saknas

      // Hämta alla events med de fält som behövs för logiken
      const queryCommand = new QueryCommand({
        TableName: MAIN_TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `GROUP#${groupSlug}` } },
        // Hämta endast de fält vi behöver
        ProjectionExpression: "eventId, createdAt, updatedAt",
      });

      const { Items } = await dbClient.send(queryCommand);
      
      const newEventIds: string[] = [];
      const updatedEventIds: string[] = [];

      if (Items && Items.length > 0) {
        const events = Items.map(item => unmarshall(item));

        for (const event of events) {
          if (!event.eventId || !event.createdAt || !event.updatedAt) continue;

          // LOGIK FÖR NYTT EVENT
          // Ett event är "nytt" om användaren aldrig har sett dess ID förut.
          if (!readEventIds.has(event.eventId)) {
            newEventIds.push(event.eventId);
            continue; // Hoppa över resten av logiken för detta event
          }
          
          // LOGIK FÖR UPPDATERAT EVENT
          // Ett event är "uppdaterat" för denna användare om:
          // 1. Det faktiskt har blivit ändrat sedan det skapades (updatedAt > createdAt).
          // 2. Ändringen är nyare än senast användaren kollade.
          if (event.updatedAt > event.createdAt && new Date(event.updatedAt) > userLastViewedTimestamp) {
            updatedEventIds.push(event.eventId);
          }
        }
      }

      const hasNotification = newEventIds.length > 0 || updatedEventIds.length > 0;

      return sendResponse({ 
        hasNotification,
        newEventIds,
        updatedEventIds
      }, 200);

    } catch (error: any) {
      console.error("Error checking notification status:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);