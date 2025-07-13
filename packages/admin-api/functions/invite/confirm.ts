import { DynamoDBClient, GetItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const INVITE_TABLE = process.env.INVITE_TABLE;
const USER_POOL_ID = process.env.USER_POOL_ID;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!INVITE_TABLE || !USER_POOL_ID || !event.body) {
    return sendError(500, "Server configuration or request body is missing.");
  }
  
  const { inviteId } = event.pathParameters || {};
  if (!inviteId) {
    return sendError(400, "Invite ID is required.");
  }
  
  try {
    // --- STEG 1: Validera inkommande data ---
    const { given_name, family_name, password } = JSON.parse(event.body);

    if (!given_name || !family_name || !password) {
      return sendError(400, "First name, last name, and password are required.");
    }
    if (password.length < 8) {
      return sendError(400, "Password must be at least 8 characters long.");
    }
    // Denna regex bör matcha din frontend-validering
    if (!/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      return sendError(400, "Password must contain both letters and numbers.");
    }

    // --- STEG 2: Hämta och validera inbjudan ---
    const getInviteCommand = new GetItemCommand({
      TableName: INVITE_TABLE,
      Key: { inviteId: { S: inviteId } },
    });
    const { Item: inviteItem } = await dbClient.send(getInviteCommand);
    if (!inviteItem) {
      return sendError(404, "Invite not found or has expired.");
    }
    const invite = unmarshall(inviteItem);

    // --- STEG 3: Skapa användaren i Cognito ---
    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: invite.email,
      UserAttributes: [
        { Name: "email", Value: invite.email },
        { Name: "given_name", Value: given_name },
        { Name: "family_name", Value: family_name },
        { Name: "email_verified", Value: "true" },
        { Name: "custom:role", Value: invite.role },
      ],
      MessageAction: "SUPPRESS",
    });

    const { User } = await cognitoClient.send(createUserCommand);
    if (!User || !User.Username) {
        throw new Error("Failed to create user in Cognito.");
    }

    // --- STEG 4: Sätt användarens lösenord ---
    const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: User.Username,
        Password: password,
        Permanent: true,
    });
    await cognitoClient.send(setPasswordCommand);

    // --- STEG 5: Lägg till användaren i rätt Cognito-grupp ---
    const addUserToGroupCmd = new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: User.Username,
        GroupName: invite.groupSlug,
    });
    await cognitoClient.send(addUserToGroupCmd);

    // --- STEG 6: Radera den använda inbjudan ---
    const deleteInviteCommand = new DeleteItemCommand({
        TableName: INVITE_TABLE,
        Key: { inviteId: { S: inviteId } },
    });
    await dbClient.send(deleteInviteCommand);

    return sendResponse({ message: "Account created and added to group." }, 201);

  } catch (error: any) {
    if (error.name === "UsernameExistsException") {
      return sendError(409, "A user with this email already exists.");
    }
    if (error.name === 'SyntaxError') {
      return sendError(400, "Invalid JSON format in request body.");
    }
    console.error("Error confirming invite:", error);
    return sendError(500, error.message);
  }
};
