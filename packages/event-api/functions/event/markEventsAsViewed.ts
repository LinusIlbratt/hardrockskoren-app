// functions/event/markEventsAsViewed.ts

import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { AuthContext } from "../../../core/types";
import { cognito } from "../../../core/services/cognito";
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import middy from "@middy/core";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

interface RequestBody {
  eventId: string;
}

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    if (!event.body) {
      return sendError(400, "Request body is required.");
    }

    try {
      const userContext = event.requestContext.authorizer.lambda;
      if (!userContext.uuid || !userContext.userPoolId) {
        return sendError(400, "User context is missing.");
      }

      const { eventId } = JSON.parse(event.body) as RequestBody;
      if (!eventId) {
        return sendError(400, "Request body must contain 'eventId'.");
      }

      const { UserAttributes } = await cognito.adminGetUser({
          UserPoolId: userContext.userPoolId,
          Username: userContext.uuid,
      });

      const readEventsAttr = UserAttributes?.find(attr => attr.Name === 'custom:readEventIds');
      const readEventIds = new Set(readEventsAttr?.Value ? readEventsAttr.Value.split(',') : []);
      
      // Om eventet redan är läst, behöver vi inte göra något.
      if (readEventIds.has(eventId)) {
        return sendResponse({ message: "Event already marked as viewed." }, 200);
      }
      
      readEventIds.add(eventId);
      
      await cognitoClient.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: userContext.userPoolId,
        Username: userContext.uuid,
        UserAttributes: [{
          Name: 'custom:readEventIds',
          Value: Array.from(readEventIds).join(','),
        }],
      }));
      
      return sendResponse({ message: "Successfully marked event as viewed." }, 200);
    } catch (error: any) {
        console.error("Error in markEventsAsViewed:", error);
        return sendError(500, error.message || "Internal server error");
    }
  }
);