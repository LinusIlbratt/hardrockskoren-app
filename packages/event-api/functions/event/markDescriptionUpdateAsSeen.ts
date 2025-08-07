// functions/event/markDescriptionUpdateAsSeen.ts

import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { AuthContext } from "../../../core/types";
import { cognito } from "../../../core/services/cognito";
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import middy from "@middy/core";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    try {
        const userContext = event.requestContext.authorizer.lambda;
        const { eventId } = event.pathParameters || {};
        const body = event.body ? JSON.parse(event.body) : {};
        const { descriptionUpdatedAt } = body;

        if (!userContext.uuid || !userContext.userPoolId || !eventId || !descriptionUpdatedAt) {
            return sendError(400, "Missing required parameters.");
        }

        const { UserAttributes } = await cognito.adminGetUser({
            UserPoolId: userContext.userPoolId,
            Username: userContext.uuid,
        });

        // ÄNDRING: Använder det nya, kortare namnet
        const seenUpdatesAttr = UserAttributes?.find(attr => attr.Name === 'custom:seenDescUpd');
        const seenUpdates: Record<string, string> = seenUpdatesAttr?.Value ? JSON.parse(seenUpdatesAttr.Value) : {};
        seenUpdates[eventId] = descriptionUpdatedAt;

        await cognitoClient.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: userContext.userPoolId,
            Username: userContext.uuid,
            UserAttributes: [{ 
                // ÄNDRING: Använder det nya, kortare namnet
                Name: 'custom:seenDescUpd', 
                Value: JSON.stringify(seenUpdates) 
            }],
        }));
        
        return sendResponse({ message: "Successfully marked description update as seen." }, 200);
    } catch (error: any) {
        console.error("Error marking description update as seen:", error);
        return sendError(500, error.message || "Internal server error");
    }
  }
);