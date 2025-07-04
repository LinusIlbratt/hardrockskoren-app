// Fil: unlinkMaterialFromRepertoire.ts

import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
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
    // Samma behörighetskontroll som i din länk-funktion
    const allowedRoles = ['admin', 'leader'];
    const userId = event.requestContext.authorizer?.lambda?.uuid;
    if (!userId) { return sendError(403, "Forbidden: User not identifiable."); }

    const userCommand = new AdminGetUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: userId });
    const userResponse = await cognitoClient.send(userCommand);
    const roleAttribute = userResponse.UserAttributes?.find(attr => attr.Name === "custom:role");

    if (!roleAttribute?.Value || !allowedRoles.includes(roleAttribute.Value)) {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    // Hämta alla tre nödvändiga parametrar från URL:en
    const { groupName, repertoireId, materialId } = event.pathParameters || {};
    if (!groupName || !repertoireId || !materialId) {
      return sendError(400, "Group name, Repertoire ID, and Material ID are required.");
    }

    // Skapa nyckeln för den post som ska tas bort.
    // Den måste exakt matcha PK och SK för posten som skapades av länk-funktionen.
    const keyToDelete = {
      PK: `GROUP#${groupName}#REPERTOIRE#${repertoireId}`,
      SK: `MATERIAL#${materialId}`,
    };

    // Skapa ett DeleteItemCommand
    const command = new DeleteItemCommand({
      TableName: MAIN_TABLE,
      Key: marshall(keyToDelete),
    });

    // Skicka kommandot för att ta bort posten
    await dbClient.send(command);

    // Skicka ett lyckat svar. 204 No Content är vanligt för lyckade DELETE-anrop.
    return sendResponse({}, 204);

  } catch (error: any) {
    console.error("Error unlinking material from repertoire:", error);
    return sendError(500, error.message);
  }
};