import { DynamoDBClient, GetItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
// Importera det som behövs för Cognito-anropet
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const MAIN_TABLE = process.env.MAIN_TABLE;
const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE || !BUCKET_NAME || !COGNITO_USER_POOL_ID) {
    return sendError(500, "Server configuration error.");
  }

  try {
    // --- KORRIGERAD ADMIN-KONTROLL ---
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
    // --- SLUT PÅ KORRIGERING ---

    const { materialId } = event.pathParameters || {};
    if (!materialId) {
      return sendError(400, "Material ID is required.");
    }

    const key = {
      PK: { S: `MATERIAL#${materialId}` },
      SK: { S: `MATERIAL#${materialId}` },
    };

    // Resten av funktionen är densamma...
    const getItemCommand = new GetItemCommand({ TableName: MAIN_TABLE, Key: key });
    const { Item } = await dbClient.send(getItemCommand);
    if (!Item) { return sendError(404, "Material not found."); }
    
    const material = unmarshall(Item);
    const fileKey = material.fileKey;

    if (fileKey) {
      const deleteObjectCommand = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: fileKey });
      await s3Client.send(deleteObjectCommand);
    }

    const deleteItemCommand = new DeleteItemCommand({ TableName: MAIN_TABLE, Key: key });
    await dbClient.send(deleteItemCommand);

    return sendResponse({ message: "Material deleted successfully from S3 and DynamoDB." }, 200);

  } catch (error: any) {
    console.error("Error deleting material:", error);
    return sendError(500, error.message);
  }
};