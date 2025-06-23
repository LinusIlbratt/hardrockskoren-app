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
    // 1. Hämta och validera inbjudan
    const getInviteCommand = new GetItemCommand({
      TableName: INVITE_TABLE,
      Key: { inviteId: { S: inviteId } },
    });
    const { Item: inviteItem } = await dbClient.send(getInviteCommand);
    if (!inviteItem) {
      return sendError(404, "Invite not found or has expired.");
    }
    const invite = unmarshall(inviteItem);

    // 2. Skapa användaren i Cognito
    const { given_name, family_name, password } = JSON.parse(event.body);
    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: invite.email,
      UserAttributes: [
        { Name: "email", Value: invite.email },
        { Name: "given_name", Value: given_name },
        { Name: "family_name", Value: family_name },
        { Name: "email_verified", Value: "true" },
        { Name: "custom:role", Value: invite.role },
        // KORRIGERING 1: Använd det nya, korrekta fältet från invite-objektet
        { Name: "custom:group", Value: invite.groupSlug },
      ],
      MessageAction: "SUPPRESS",
    });

    const { User } = await cognitoClient.send(createUserCommand);
    if (!User || !User.Username) {
        throw new Error("Failed to create user in Cognito.");
    }

    // 3. Sätt användarens lösenord
    const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: User.Username,
        Password: password,
        Permanent: true,
    });
    await cognitoClient.send(setPasswordCommand);

    // 4. Lägg till användaren i rätt Cognito-grupp
    const addUserToGroupCmd = new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: User.Username,
        // KORRIGERING 2: Använd sluggen även här för att hitta rätt grupp
        GroupName: invite.groupSlug,
    });
    await cognitoClient.send(addUserToGroupCmd);

    // 5. Radera den använda inbjudan
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
    console.error("Error confirming invite:", error);
    return sendError(500, error.message);
  }
};