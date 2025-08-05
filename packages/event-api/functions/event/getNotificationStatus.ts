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
      const userLastViewedTimestamp = lastViewedAttr?.Value ? new Date(lastViewedAttr.Value) : new Date(0);

      // STEG 1: Hämta även det nya 'descriptionUpdatedAt'-fältet
      const queryCommand = new QueryCommand({
        TableName: MAIN_TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `GROUP#${groupSlug}` } },
        ProjectionExpression: "eventId, createdAt, updatedAt, descriptionUpdatedAt",
      });

      const { Items } = await dbClient.send(queryCommand);
      
      // STEG 2: Förbered de nya, mer specifika listorna
      const newEventIds: string[] = [];
      const updatedDescriptionIds: string[] = [];
      const updatedOtherIds: string[] = [];

      if (Items && Items.length > 0) {
        const events = Items.map(item => unmarshall(item));

        for (const event of events) {
          // Säkerställ att vi har nödvändig data
          if (!event.eventId || !event.createdAt || !event.updatedAt) continue;

          // LOGIK FÖR NYTT EVENT (Oförändrad och korrekt)
          if (!readEventIds.has(event.eventId)) {
            newEventIds.push(event.eventId);
            continue; // Hoppa över resten av logiken för detta event
          }
          
          // STEG 3: Ny, smartare logik för att skilja på uppdateringar
          const hasUpdatedDescription = event.descriptionUpdatedAt && new Date(event.descriptionUpdatedAt) > userLastViewedTimestamp;
          const hasOtherUpdate = event.updatedAt > event.createdAt && new Date(event.updatedAt) > userLastViewedTimestamp;

          // Prioritera beskrivnings-uppdatering. Om den finns, är det den notisen vi vill visa.
          if (hasUpdatedDescription) {
            updatedDescriptionIds.push(event.eventId);
          } 
          // Annars, om det finns en annan typ av uppdatering, lägg den i den andra listan.
          else if (hasOtherUpdate) {
            updatedOtherIds.push(event.eventId);
          }
        }
      }

      // STEG 4: Uppdatera logiken för att avgöra om det finns NÅGON notis
      const hasNotification = newEventIds.length > 0 || updatedDescriptionIds.length > 0 || updatedOtherIds.length > 0;

      // STEG 5: Skicka tillbaka det nya, mer detaljerade svaret
      return sendResponse({ 
        hasNotification,
        newEventIds,
        updatedDescriptionIds,
        updatedOtherIds
      }, 200);

    } catch (error: any) {
      console.error("Error checking notification status:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);