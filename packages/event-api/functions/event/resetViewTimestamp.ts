// functions/events/resetViewTimestamp.ts

import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { AuthContext } from "../../../core/types";
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import middy from "@middy/core";

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

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

      // Sätt en ny tidsstämpel för 'eventsLastViewedAt' till precis nu.
      const nowISO = new Date().toISOString();

      const updateCommand = new AdminUpdateUserAttributesCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: userContext.uuid,
        UserAttributes: [
          {
            Name: 'custom:eventsLastViewedAt',
            Value: nowISO,
          },
        ],
      });
      await cognitoClient.send(updateCommand);
      
      console.log(`Reset eventsLastViewedAt timestamp for user ${userContext.uuid}`);

      return sendResponse({ message: "Successfully reset notification view timestamp." }, 200);

    } catch (error: any) {
        console.error("Error resetting view timestamp:", error);
        return sendError(500, error.message || "Internal server error");
    }
  }
);