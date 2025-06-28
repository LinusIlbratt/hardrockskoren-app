import { DynamoDBClient, BatchWriteItemCommand, WriteRequest } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const MAIN_TABLE = process.env.MAIN_TABLE;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE || !COGNITO_USER_POOL_ID) {
    return sendError(500, "Server configuration error.");
  }

  try {
    // Behörighetskontroll: Både admin och körledare får göra detta
    const allowedRoles = ['admin', 'leader'];
    const userId = event.requestContext.authorizer?.lambda?.uuid;
    if (!userId) { return sendError(403, "Forbidden: User not identifiable."); }

    const userCommand = new AdminGetUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: userId });
    const userResponse = await cognitoClient.send(userCommand);
    const roleAttribute = userResponse.UserAttributes?.find(attr => attr.Name === "custom:role");

    if (!roleAttribute?.Value || !allowedRoles.includes(roleAttribute.Value)) {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    // Hämta parametrar från anropet
    const { groupName, repertoireId } = event.pathParameters || {};
    if (!groupName || !repertoireId) {
      return sendError(400, "Group name and Repertoire ID are required.");
    }

    if (!event.body) {
      return sendError(400, "Request body is required.");
    }
    const { materialIds } = JSON.parse(event.body);
    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return sendError(400, "An array of materialIds is required.");
    }

    // Skapa en "PutRequest" för varje material som ska kopplas
    const putRequests: WriteRequest[] = materialIds.map((materialId: string) => {
      const item = {
        PK: `GROUP#${groupName}#REPERTOIRE#${repertoireId}`,
        SK: `MATERIAL#${materialId}`,
        materialId: materialId, // Bra att ha för framtida bruk
        linkedAt: new Date().toISOString(),
      };

      return {
        PutRequest: {
          Item: marshall(item),
        },
      };
    });

    // Skicka alla förfrågningar i en enda effektiv batch
    const command = new BatchWriteItemCommand({
      RequestItems: {
        [MAIN_TABLE]: putRequests,
      },
    });

    await dbClient.send(command);

    return sendResponse({ message: `${materialIds.length} material(s) linked successfully to repertoire.` }, 200);

  } catch (error: any) {
    console.error("Error linking materials to repertoire:", error);
    return sendError(500, error.message);
  }
};