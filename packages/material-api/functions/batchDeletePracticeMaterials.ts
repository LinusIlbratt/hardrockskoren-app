import { DynamoDBClient, BatchGetItemCommand, BatchWriteItemCommand, WriteRequest } from "@aws-sdk/client-dynamodb";
import { S3Client, DeleteObjectsCommand, ObjectIdentifier } from "@aws-sdk/client-s3";
import { unmarshall } from "@aws-sdk/util-dynamodb";
// --- KORRIGERING 1: Importera rätt typer ---
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../core/types";
import { sendResponse, sendError } from "../../core/utils/http";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const MAIN_TABLE = process.env.MAIN_TABLE!;
const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME!;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export const handler = async (
    event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext> // <-- Använder rätt typ
): Promise<APIGatewayProxyResultV2> => {
    if (!MAIN_TABLE || !BUCKET_NAME || !COGNITO_USER_POOL_ID) {
        return sendError(500, "Server configuration error.");
    }

    try {
        // Admin-kontroll (denna kod fungerar nu tack vare rätt event-typ)
        const roleFromToken = event.requestContext.authorizer.lambda.role;
        if (roleFromToken !== "admin") {
            return sendError(403, "Forbidden: You do not have permission to perform this action.");
        }

        if (!event.body) { return sendError(400, "Request body is required."); }
        const { materialIds } = JSON.parse(event.body);
        if (!Array.isArray(materialIds) || materialIds.length === 0) {
            return sendError(400, "An array of materialIds is required.");
        }

        // STEG 1: Hämta alla objekt från DynamoDB för att få deras fileKeys
        const keysToGet = materialIds.map(id => ({
            PK: { S: 'SJUNGUPP#MATERIALS' },
            SK: { S: `MATERIAL#${id}` },
        }));

        const getCommand = new BatchGetItemCommand({
            RequestItems: { [MAIN_TABLE]: { Keys: keysToGet } }
        });
        const getResult = await dbClient.send(getCommand);
        const itemsToDelete = getResult.Responses?.[MAIN_TABLE] || [];

        // Om inga av de angivna ID:na fanns, kan vi sluta här.
        if (itemsToDelete.length === 0) {
            return sendResponse({ message: "No matching materials found to delete." }, 200);
        }

        // STEG 2: Radera alla filer från S3
        const keysToDeleteFromS3: ObjectIdentifier[] = itemsToDelete
            .map(item => unmarshall(item).fileKey) // Hämta fileKey från de objekt vi faktiskt hittade
            .filter(Boolean)
            .map(key => ({ Key: key }));

        if (keysToDeleteFromS3.length > 0) {
            const deleteS3Command = new DeleteObjectsCommand({
                Bucket: BUCKET_NAME,
                Delete: { Objects: keysToDeleteFromS3 },
            });
            await s3Client.send(deleteS3Command);
        }

        // STEG 3: Radera alla poster från DynamoDB
        // --- OPTIMERING 2: Bygg Delete-requesten från de objekt vi redan hämtat ---
        const keysToDeleteFromDB: WriteRequest[] = itemsToDelete.map(item => ({
            DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
        }));

        const deleteDBCommand = new BatchWriteItemCommand({
            RequestItems: { [MAIN_TABLE]: keysToDeleteFromDB }
        });
        await dbClient.send(deleteDBCommand);

        return sendResponse({ message: `${keysToDeleteFromDB.length} material(s) deleted successfully.` }, 200);

    } catch (error: any) {
        console.error("Error batch deleting materials:", error);
        return sendError(500, error.message);
    }
};