import { CognitoIdentityProviderClient, ListUsersInGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const USER_POOL_ID = process.env.USER_POOL_ID;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!USER_POOL_ID) {
    return sendError(500, "Server configuration error: User Pool ID not set.");
  }

  try {
    const { groupName } = event.pathParameters || {};
    if (!groupName) {
      return sendError(400, "Group name is required in the path.");
    }

    const command = new ListUsersInGroupCommand({
      UserPoolId: USER_POOL_ID,
      GroupName: groupName,
    });

    const { Users } = await cognitoClient.send(command);

    // Formatera om svaret till ett enklare format för frontenden
    const formattedUsers = (Users || []).map(user => {
      const attributes = user.Attributes || [];
      return {
        id: attributes.find(a => a.Name === 'sub')?.Value,
        email: attributes.find(a => a.Name === 'email')?.Value,
        given_name: attributes.find(a => a.Name === 'given_name')?.Value,
        family_name: attributes.find(a => a.Name === 'family_name')?.Value,
        role: attributes.find(a => a.Name === 'custom:role')?.Value,
      };
    });

    return sendResponse(formattedUsers, 200);

  } catch (error: any) {
    console.error("Error listing users in group:", error);
    return sendError(500, error.message || "Internal server error");
  }
};
