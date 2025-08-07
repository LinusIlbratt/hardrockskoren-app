import { 
    DynamoDBClient, 
    TransactWriteItemsCommand,
    TransactWriteItem
} from "@aws-sdk/client-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { nanoid } from "nanoid";
import { randomUUID } from "crypto";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { sendResponse, sendError } from "../../core/utils/http";

// Initialisera klienter
const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

// Konfiguration
const MAIN_TABLE = process.env.MAIN_TABLE;
const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

// <-- ÄNDRING: Tydligare interface för vad vi förväntar oss från frontend
interface FilePayload {
  fileName: string;
  relativePath: string;
}

interface UploadTask {
  fileName: string;
  uploadUrl: string;
  relativePath: string; // <-- ÄNDRING: Skicka tillbaka för att klienten ska kunna mappa rätt
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE || !BUCKET_NAME || !COGNITO_USER_POOL_ID) {
    return sendError(500, "Server configuration error.");
  }

  try {
    // Admin-behörighetskontroll (inga ändringar här)
    const userId = event.requestContext.authorizer?.lambda?.uuid;
    if (!userId) return sendError(403, "Forbidden: User not identifiable.");
    const userCommand = new AdminGetUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: userId });
    const userResponse = await cognitoClient.send(userCommand);
    const roleAttribute = userResponse.UserAttributes?.find(attr => attr.Name === "custom:role");
    if (roleAttribute?.Value !== "admin") return sendError(403, "Forbidden: You do not have permission.");

    // Validera input från frontend
    if (!event.body) return sendError(400, "Request body is missing.");
    const { files }: { files: FilePayload[] } = JSON.parse(event.body); // <-- ÄNDRING: Använd vårt nya interface
    if (!files || !Array.isArray(files) || files.length === 0) {
      return sendError(400, "Request requires a non-empty 'files' array.");
    }

    const dbWriteItems: TransactWriteItem[] = [];
    const signedUrlPromises: Promise<UploadTask>[] = [];

    // Loopa igenom varje fil som ska laddas upp
    for (const file of files) {
      // <-- ÄNDRING: Validera att vi fått den nya datan
      if (!file.fileName || !file.relativePath) {
          return sendError(400, "Each file in the 'files' array must have 'fileName' and 'relativePath'.");
      }

      const materialId = nanoid();
      const createdAt = new Date().toISOString();
      const s3Key = `materials/${randomUUID()}-${file.fileName}`;

      // Förbered databasposten
      const item = {
        PK: `MATERIAL#${materialId}`,
        SK: `MATERIAL#${materialId}`,
        GSI1PK: "MATERIALS",
        GSI1SK: createdAt,
        materialId,
        title: file.fileName,
        fileKey: s3Key,
        filePath: file.relativePath, // <-- ÄNDRING: Här sparar vi den fullständiga sökvägen!
        createdAt,
        type: "GlobalMaterial",
      };
      dbWriteItems.push({ Put: { TableName: MAIN_TABLE, Item: marshall(item) } });

      // Förbered ett löfte (promise) för att skapa en signerad URL
      const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
      const promise = getSignedUrl(s3Client, command, { expiresIn: 3600 }).then(uploadUrl => ({
        fileName: file.fileName,
        uploadUrl: uploadUrl,
        relativePath: file.relativePath, // <-- ÄNDRING: Inkludera i svaret
      }));
      signedUrlPromises.push(promise);
    }

    // Kör alla URL-genereringar parallellt för maximal prestanda
    const uploadTasks = await Promise.all(signedUrlPromises);

    // Skriv alla nya material till databasen i en enda säker transaktion
    const transactionCommand = new TransactWriteItemsCommand({
      TransactItems: dbWriteItems,
    });
    await dbClient.send(transactionCommand);

    return sendResponse({ uploadTasks }, 200);

  } catch (error: any) {
    console.error("Error preparing batch material upload:", error);
    return sendError(500, error.message || "Internal server error");
  }
};