import { 
  CognitoIdentityProviderClient, 
  AdminDeleteUserCommand // Importera rätt kommando
} from "@aws-sdk/client-cognito-identity-provider";
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
    // Vi behöver bara email för att radera användaren. 
    const { email } = JSON.parse(event.body);
    if (!email) {
      return sendError(400, "User email is required.");
    }

    // SKAPA OCH SKICKA KOMMANDOT FÖR ATT RADERA ANVÄNDAREN PERMANENT
    const deleteUserCmd = new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,       // Cognito använder 'Username' för att identifiera användaren
    });

    await cognitoClient.send(deleteUserCmd);

    // Uppdaterat svarsmeddelande för att reflektera den nya åtgärden
    return sendResponse({ message: `User ${email} has been permanently deleted.` }, 200);

  } catch (error: any) {
    console.error("Error deleting user:", error);

    // Om användaren inte finns i Cognito överhuvudtaget
    if (error.name === 'UserNotFoundException') {
      const requestBody = JSON.parse(event.body || '{}');
      return sendError(404, `User with email ${requestBody.email} not found.`);
    }
    
    // Andra vanliga fel kan också hanteras här
    return sendError(500, error.message);
  }
};