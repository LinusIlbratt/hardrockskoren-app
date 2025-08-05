// functions/events/markEventsAsViewed.ts

import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { AuthContext } from "../../../core/types";
// ÄNDRING 1: Importera din anpassade cognito-service
import { cognito } from "../../../core/services/cognito"; 
// Ta bort AdminGetUserCommand, men behåll resten
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import middy from "@middy/core";

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

interface RequestBody {
  eventId: string;
}

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    if (!COGNITO_USER_POOL_ID) {
      return sendError(500, "Server configuration error: User Pool ID not set.");
    }

    try {
      const userContext = event.requestContext.authorizer.lambda;
      if (!userContext.uuid) {
        return sendError(400, "User context is missing.");
      }

      const { eventId } = JSON.parse(event.body || '{}') as RequestBody;
      if (!eventId) {
        return sendError(400, "Request body must contain an 'eventId'.");
      }

      // ÄNDRING 2: Använd din 'cognito'-service för att hämta användaren, precis som i getNotificationStatus.ts
      const { UserAttributes } = await cognito.adminGetUser({
          UserPoolId: COGNITO_USER_POOL_ID,
          Username: userContext.uuid,
      });

      const readEventsAttr = UserAttributes?.find(attr => attr.Name === 'custom:readEventIds');
      const readEventIds = new Set(readEventsAttr?.Value ? readEventsAttr.Value.split(',') : []);

      readEventIds.add(eventId);
      const newReadEventIdsString = Array.from(readEventIds).join(',');

      // Uppdateringen via den direkta klienten är korrekt och behålls
      const updateCommand = new AdminUpdateUserAttributesCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: userContext.uuid,
        UserAttributes: [
          {
            Name: 'custom:readEventIds',
            Value: newReadEventIdsString,
          },
        ],
      });
      await cognitoClient.send(updateCommand);
      
      console.log(`Added eventId ${eventId} to read list for user ${userContext.uuid}`);

      return sendResponse({ message: "Successfully marked event as viewed." }, 200);

    } catch (error: any) {
      console.error("Error marking event as viewed:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);