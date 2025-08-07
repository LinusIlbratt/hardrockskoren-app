import { DynamoDBClient, BatchGetItemCommand, BatchWriteItemCommand, WriteRequest } from "@aws-sdk/client-dynamodb";
import { S3Client, DeleteObjectsCommand, ObjectIdentifier } from "@aws-sdk/client-s3";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
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
    // Admin-behörighetskontroll (oförändrad)
    const userId = event.requestContext.authorizer?.lambda?.uuid;
    if (!userId) { return sendError(403, "Forbidden: User not identifiable."); }
    const userCommand = new AdminGetUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: userId });
    const userResponse = await cognitoClient.send(userCommand);
    const roleAttribute = userResponse.UserAttributes?.find(attr => attr.Name === "custom:role");
    if (roleAttribute?.Value !== "admin") {
      return sendError(403, "Forbidden: You do not have permission.");
    }

    if (!event.body) { return sendError(400, "Request body is required."); }
    const { materialIds } = JSON.parse(event.body);
    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return sendError(400, "An array of materialIds is required.");
    }

    // --- NY LOGIK MED CHUNKING ---
    const BATCH_SIZE = 25; // Sätt till den lägsta gränsen av de operationer vi ska göra
    const allPromises: Promise<void>[] = [];

    for (let i = 0; i < materialIds.length; i += BATCH_SIZE) {
      const chunkOfIds = materialIds.slice(i, i + BATCH_SIZE);

      // Skapa ett löfte för att hantera hela processen för ett paket
      const chunkPromise = (async () => {
        // STEG 1: Hämta objekt från DynamoDB för detta paket
        const keysToGet = chunkOfIds.map(id => ({
          PK: { S: `MATERIAL#${id}` },
          SK: { S: `MATERIAL#${id}` },
        }));
        
        const getResult = await dbClient.send(new BatchGetItemCommand({
          RequestItems: { [MAIN_TABLE]: { Keys: keysToGet } }
        }));
        const items = getResult.Responses?.[MAIN_TABLE]?.map(item => unmarshall(item)) || [];

        // STEG 2: Radera filer från S3 för detta paket
        const keysToDeleteFromS3: ObjectIdentifier[] = items
          .map(item => item.fileKey)
          .filter(Boolean)
          .map(key => ({ Key: key }));

        if (keysToDeleteFromS3.length > 0) {
          await s3Client.send(new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: { Objects: keysToDeleteFromS3 },
          }));
        }

        // STEG 3: Radera poster från DynamoDB för detta paket
        const keysToDeleteFromDB: WriteRequest[] = chunkOfIds.map(id => ({
          DeleteRequest: {
            Key: {
              PK: { S: `MATERIAL#${id}` },
              SK: { S: `MATERIAL#${id}` },
            },
          },
        }));

        if (keysToDeleteFromDB.length > 0) {
            await dbClient.send(new BatchWriteItemCommand({
                RequestItems: { [MAIN_TABLE]: keysToDeleteFromDB }
            }));
        }
      })();
      
      allPromises.push(chunkPromise);
    }
    
    // Kör alla paket-processer parallellt för bästa prestanda
    await Promise.all(allPromises);

    return sendResponse({ message: `${materialIds.length} material(s) deleted successfully.` }, 200);

  } catch (error: any) {
    console.error("Error batch deleting materials:", error);
    // Ge ett mer generellt felmeddelande till klienten
    return sendError(500, "An internal error occurred during the deletion process.");
  }
};