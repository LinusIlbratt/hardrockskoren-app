import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../core/types";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { sendResponse, sendError } from "../../core/utils/http";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const MAIN_TABLE = process.env.MAIN_TABLE;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

export const handler = async (
  event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE || !COGNITO_USER_POOL_ID) {
    return sendError(500, "Server configuration error.");
  }

  try {
    const userId = event.requestContext.authorizer?.lambda?.uuid;
    if (!userId) {
      return sendError(403, "Forbidden: User not identifiable.");
    }

    const userCommand = new AdminGetUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: userId });
    const userResponse = await cognitoClient.send(userCommand);
    const roleAttribute = userResponse.UserAttributes?.find(attr => attr.Name === "custom:role");

    if (roleAttribute?.Value !== "admin") {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    if (!event.body) {
      return sendError(400, "Request body is required.");
    }
    
    // ÄNDRING 1: Hämta ut 'weekId' från anropet
    const { title, fileKey, weekId } = JSON.parse(event.body);
    
    // Lägg till validering för det nya fältet
    if (!title || !fileKey || !weekId) {
        return sendError(400, "Title, fileKey, and weekId are required.");
    }
    // Enkel validering för att säkerställa att formatet är ungefär rätt
    if (!/^\d{4}-W\d{1,2}$/.test(weekId)) {
        return sendError(400, "Invalid weekId format. Expected format is YYYY-Www, e.g., 2025-W31.");
    }

    const materialId = nanoid();
    const createdAt = new Date().toISOString();

    const item = {
      PK: `SJUNGUPP#MATERIALS`,
      SK: `MATERIAL#${materialId}`,
      materialId,
      title,
      fileKey,
      weekId, // ÄNDRING 2: Lägg till weekId i objektet som sparas
      createdAt,
      type: "PracticeMaterial",
    };
    
    const command = new PutItemCommand({ TableName: MAIN_TABLE, Item: marshall(item) });
    await dbClient.send(command);
    
    return sendResponse({ message: "Global material created successfully.", item }, 201);

  } catch (error: any) {
    console.error("Error creating global material:", error);
    return sendError(500, error.message);
  }
};