// functions/event/markUpdateAsSeen.ts
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { AuthContext } from "../../../core/types";
import { cognito } from "../../../core/services/cognito";
// STEG 1: Importera den fullständiga klienten
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import middy from "@middy/core";

// STEG 2: Skapa en instans av klienten
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    try {
        const userContext = event.requestContext.authorizer.lambda;
        const { eventId } = event.pathParameters || {};
        const body = event.body ? JSON.parse(event.body) : {};
        const { updatedAt } = body;

        // STEG 3: Lägg till kontroll för userPoolId för typsäkerhet
        if (!userContext.uuid || !userContext.userPoolId || !eventId || !updatedAt) {
            return sendError(400, "Missing user context, eventId, or updatedAt.");
        }

        // Vi använder fortfarande din service för att hämta, det är smidigt
        const { UserAttributes } = await cognito.adminGetUser({
            UserPoolId: userContext.userPoolId,
            Username: userContext.uuid,
        });

        const seenUpdatesAttr = UserAttributes?.find(attr => attr.Name === 'custom:seenEventUpdates');
        const seenEventUpdates: Record<string, string> = seenUpdatesAttr?.Value ? JSON.parse(seenUpdatesAttr.Value) : {};

        seenEventUpdates[eventId] = updatedAt;

        // STEG 4: Använd den råa klienten för att skicka uppdateringskommandot
        const updateCommand = new AdminUpdateUserAttributesCommand({
            UserPoolId: userContext.userPoolId,
            Username: userContext.uuid,
            UserAttributes: [{
                Name: 'custom:seenEventUpdates',
                Value: JSON.stringify(seenEventUpdates),
            }],
        });
        await cognitoClient.send(updateCommand);
        
        return sendResponse({ message: "Successfully marked update as seen." }, 200);
    } catch (error: any) {
        console.error("Error marking update as seen:", error);
        return sendError(500, error.message || "Internal server error");
    }
  }
);