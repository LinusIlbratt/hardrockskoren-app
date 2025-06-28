import { CognitoIdentityProviderClient, AdminRemoveUserFromGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const USER_POOL_ID = process.env.USER_POOL_ID;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  // Validera att vi har all nödvändig konfiguration och data
  if (!USER_POOL_ID || !event.body) {
    return sendError(500, "Server configuration or request body is missing.");
  }

  try {
    const { email, groupSlug } = JSON.parse(event.body);
    if (!email || !groupSlug) {
      return sendError(400, "User email and groupSlug are required.");
    }

    // DEN ENDA ÅTGÄRDEN: Ta bort användaren från Cognito-gruppen.
    // Detta återkallar användarens medlemskap och behörigheter för den specifika kören.
    const removeUserFromGroupCmd = new AdminRemoveUserFromGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,       // Cognito använder 'Username' för att identifiera användaren
      GroupName: groupSlug,  // Namnet på gruppen de ska tas bort från
    });

    await cognitoClient.send(removeUserFromGroupCmd);

    // Eftersom vi inte längre interagerar med DynamoDB, är vi klara här.

    return sendResponse({ message: `User ${email} successfully removed from group ${groupSlug}.` }, 200);

  } catch (error: any) {
    console.error("Error removing user from group:", error);

    // Om användaren inte finns i Cognito överhuvudtaget
    if (error.name === 'UserNotFoundException') {
      return sendError(404, `User with email ${JSON.parse(event.body!).email} not found.`);
    }
    // Andra vanliga fel kan också hanteras här om det behövs

    return sendError(500, error.message);
  }
};