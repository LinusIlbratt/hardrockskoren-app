import { CognitoIdentityProviderClient, ListUsersInGroupCommand, UserType } from "@aws-sdk/client-cognito-identity-provider";
// Importera typerna för event och context
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../../core/types"; // Se till att sökvägen till din AuthContext-typ är korrekt
import { sendResponse, sendError } from "../../../core/utils/http";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const USER_POOL_ID = process.env.USER_POOL_ID;

export const handler = async (
  // Använd den typsäkra versionen av eventet
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

    let allUsers: UserType[] = [];
    let nextToken: string | undefined;

    // Paginering - Loopa tills vi har hämtat alla användare
    do {
      const command = new ListUsersInGroupCommand({
        UserPoolId: USER_POOL_ID,
        GroupName: groupName,
        NextToken: nextToken,
      });

      const response = await cognitoClient.send(command);
      
      if (response.Users) {
        allUsers = [...allUsers, ...response.Users];
      }
      
      nextToken = response.NextToken;
    } while (nextToken);

    // --- NY BEHÖRIGHETS-FILTRERING ---
    // Hämta roll och ID för den som anropar API:et från authorizer-kontexten.
    const invokerRole = event.requestContext.authorizer.lambda.role;
    const invokerId = event.requestContext.authorizer.lambda.uuid;

    let usersToFormat = allUsers;

    // Om den som anropar är en 'leader', filtrera bort alla andra ledare.
    if (invokerRole === 'leader') {
      usersToFormat = allUsers.filter(user => {
        const userRole = user.Attributes?.find(attr => attr.Name === 'custom:role')?.Value;
        // Behåll användaren om:
        // 1. Deras roll INTE är 'leader'
        // ELLER
        // 2. Deras roll ÄR 'leader', MEN det är den inloggade användaren själv.
        return userRole !== 'leader' || user.Username === invokerId;
      });
    }
    // En 'admin' kommer att hoppa över denna if-sats och ser alla.
    
    // Formatera om den (potentiellt filtrerade) listan för frontenden
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

    return sendResponse(formattedUsers, 200);

  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
        return sendError(404, `Group with name '${event.pathParameters?.groupName}' not found.`);
    }
    console.error("Error listing users in group:", error);
    return sendError(500, error.message || "Internal server error");
  }
};