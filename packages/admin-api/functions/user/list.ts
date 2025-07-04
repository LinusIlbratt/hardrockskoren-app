import { CognitoIdentityProviderClient, ListUsersInGroupCommand, UserType } from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../../core/types";
import { sendResponse, sendError } from "../../../core/utils/http";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const USER_POOL_ID = process.env.USER_POOL_ID;

export const handler = async (
  event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
): Promise<APIGatewayProxyResultV2> => {
  if (!USER_POOL_ID) {
    return sendError(500, "Server configuration error: User Pool ID not set.");
  }

  try {
    const { groupName } = event.pathParameters || {};
    if (!groupName) {
      return sendError(400, "Group name is required in the path.");
    }

    // STEG 1: Läs paginerings-parametrar från query string
    const limit = parseInt(event.queryStringParameters?.limit || '25', 10);
    const nextToken = event.queryStringParameters?.nextToken;

    // STEG 2: Ta bort do...while-loopen och gör bara ETT anrop
    const command = new ListUsersInGroupCommand({
      UserPoolId: USER_POOL_ID,
      GroupName: groupName,
      Limit: limit, // Använd den angivna gränsen
      NextToken: nextToken, // Skicka med token för att hämta nästa sida
    });

    const response = await cognitoClient.send(command);
    const usersForPage = response.Users || [];
    
    // Behåll din befintliga behörighets-filtrering
    const invokerRole = event.requestContext.authorizer.lambda.role;
    const invokerId = event.requestContext.authorizer.lambda.uuid;

    let usersToFormat = usersForPage;
    if (invokerRole === 'leader') {
      usersToFormat = usersForPage.filter(user => {
        const userRole = user.Attributes?.find(attr => attr.Name === 'custom:role')?.Value;
        return userRole !== 'leader' || user.Username === invokerId;
      });
    }
    
    const formattedUsers = usersToFormat.map(user => {
      const attributeMap = (user.Attributes || []).reduce((acc, attr) => {
        if (attr.Name && attr.Value) {
          acc[attr.Name] = attr.Value;
        }
        return acc;
      }, {} as Record<string, string>);

      return {
        id: user.Username,
        email: attributeMap['email'],
        given_name: attributeMap['given_name'],
        family_name: attributeMap['family_name'],
        role: attributeMap['custom:role'],
      };
    });

    // STEG 3: Skicka tillbaka ett objekt med både användarna och nästa token
    return sendResponse({
      users: formattedUsers,
      nextToken: response.NextToken // Denna är nyckeln för att hämta nästa sida
    }, 200);

  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
        return sendError(404, `Group with name '${event.pathParameters?.groupName}' not found.`);
    }
    console.error("Error listing users in group:", error);
    return sendError(500, error.message || "Internal server error");
  }
};
