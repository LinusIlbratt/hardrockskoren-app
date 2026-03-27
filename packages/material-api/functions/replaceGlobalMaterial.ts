import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

interface ReplaceMaterialBody {
  fileKey?: string;
  title?: string;
  deleteOldFile?: boolean;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE || !BUCKET_NAME || !COGNITO_USER_POOL_ID) {
    return sendError(500, "Server configuration error.");
  }

  try {
    const userId = event.requestContext.authorizer?.lambda?.uuid;
    if (!userId) {
      return sendError(403, "Forbidden: User not identifiable.");
    }

    const userCommand = new AdminGetUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: userId,
    });
    const userResponse = await cognitoClient.send(userCommand);
    const roleAttribute = userResponse.UserAttributes?.find((attr) => attr.Name === "custom:role");
    if (roleAttribute?.Value !== "admin") {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    const { materialId } = event.pathParameters || {};
    if (!materialId) {
      return sendError(400, "Material ID is required.");
    }
    if (!event.body) {
      return sendError(400, "Request body is required.");
    }

    let body: ReplaceMaterialBody;
    try {
      body = JSON.parse(event.body) as ReplaceMaterialBody;
    } catch {
      return sendError(400, "Invalid JSON format in request body.");
    }

    const nextFileKey = body.fileKey?.trim();
    const nextTitle = body.title?.trim();
    const deleteOldFile = body.deleteOldFile !== false;

    if (!nextFileKey) {
      return sendError(400, "fileKey is required.");
    }
    if (nextFileKey.length > 1024) {
      return sendError(400, "fileKey is too long.");
    }
    // Defensivt: globalt material ska ligga i materials-prefix.
    if (!nextFileKey.startsWith("materials/")) {
      return sendError(400, "fileKey must start with 'materials/'.");
    }

    const key = {
      PK: { S: `MATERIAL#${materialId}` },
      SK: { S: `MATERIAL#${materialId}` },
    };

    const before = await dbClient.send(
      new GetItemCommand({
        TableName: MAIN_TABLE,
        Key: key,
      })
    );
    if (!before.Item) {
      return sendError(404, "Material not found.");
    }
    const existing = unmarshall(before.Item) as { fileKey?: string; title?: string; type?: string };
    if (existing.type !== "GlobalMaterial") {
      return sendError(400, "Only global materials can be replaced.");
    }

    const nowIso = new Date().toISOString();
    const names: Record<string, string> = {
      "#fileKey": "fileKey",
      "#updatedAt": "updatedAt",
    };
    const values: Record<string, { S: string }> = {
      ":fileKey": { S: nextFileKey },
      ":updatedAt": { S: nowIso },
    };
    const updates: string[] = ["#fileKey = :fileKey", "#updatedAt = :updatedAt"];

    if (nextTitle) {
      names["#title"] = "title";
      values[":title"] = { S: nextTitle };
      updates.push("#title = :title");
    }

    await dbClient.send(
      new UpdateItemCommand({
        TableName: MAIN_TABLE,
        Key: key,
        UpdateExpression: `SET ${updates.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );

    const oldFileKey = existing.fileKey?.trim();
    let oldFileDeleted = false;
    let oldFileDeleteWarning: string | null = null;
    if (
      deleteOldFile &&
      oldFileKey &&
      oldFileKey !== nextFileKey &&
      oldFileKey.startsWith("materials/")
    ) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: oldFileKey,
          })
        );
        oldFileDeleted = true;
      } catch (s3Error: any) {
        console.error("Material replaced but failed to delete old S3 object:", s3Error);
        oldFileDeleteWarning = "Material was replaced, but old file could not be deleted from S3.";
      }
    }

    return sendResponse(
      {
        message: "Material replaced successfully.",
        materialId,
        fileKey: nextFileKey,
        title: nextTitle || existing.title || null,
        oldFileDeleted,
        warning: oldFileDeleteWarning,
      },
      200
    );
  } catch (error: any) {
    console.error("Error replacing global material:", error);
    return sendError(500, error.message || "Internal server error");
  }
};
