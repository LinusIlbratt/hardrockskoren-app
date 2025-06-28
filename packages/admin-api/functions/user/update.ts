// packages/admin-api/functions/user/update.ts

import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const USER_POOL_ID = process.env.USER_POOL_ID;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!USER_POOL_ID || !event.body) {
    return sendError(500, "Server configuration or request body is missing.");
  }

  try {
    const { email, role } = JSON.parse(event.body);

    // Validera att vi har all information som behövs
    if (!email || !role) {
      return sendError(400, "User email and new role are required.");
    }

    // STEG 1: Förbered kommandot för att uppdatera användarattribut
    const updateUserAttributesCmd = new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        {
          Name: "custom:role", // Attributet vi vill ändra
          Value: role,         // Det nya värdet för rollen (t.ex. 'leader' eller 'user')
        },
      ],
    });

    // STEG 2: Skicka kommandot till Cognito
    await cognitoClient.send(updateUserAttributesCmd);

    return sendResponse({ message: `User ${email}'s role updated to ${role}.` }, 200);

  } catch (error: any) {
    console.error("Error updating user role:", error);
    
    if (error.name === 'UserNotFoundException') {
      return sendError(404, `User with email ${JSON.parse(event.body!).email} not found.`);
    }

    return sendError(500, error.message);
  }
};