import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "@hrk/core/utils/http";
import type { AuthContext } from "@hrk/core/types";
import { verifyPlaylistOwnership } from "./verifyPlaylistOwnership";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    const tableName = process.env.MAIN_TABLE;
    if (!tableName) {
      console.error("addPlaylistItem: MAIN_TABLE is not configured.");
      return sendError(500, "Server configuration error.");
    }

    const uuid = event.requestContext.authorizer.lambda?.uuid?.trim();
    if (!uuid) {
      return sendError(401, "User identity is missing from the request context.");
    }

    const playlistId = event.pathParameters?.playlistId?.trim();
    if (!playlistId) {
      return sendError(400, "playlistId is required in the path.");
    }

    if (!event.body?.trim()) {
      return sendError(400, "Request body is required.");
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body) as Record<string, unknown>;
    } catch {
      return sendError(400, "Invalid JSON body.");
    }

    const materialIdRaw = body.materialId;
    if (typeof materialIdRaw !== "string" || materialIdRaw.trim() === "") {
      return sendError(400, "materialId is required and must be a non-empty string.");
    }
    const materialId = materialIdRaw.trim();

    try {
      const owned = await verifyPlaylistOwnership(
        docClient,
        tableName,
        uuid,
        playlistId
      );
      if (!owned) {
        return sendError(403, "Forbidden or Playlist not found");
      }

      const addedAt = new Date().toISOString();
      const PK = `PLAYLIST#${playlistId}`;
      const SK = `MATERIAL#${materialId}`;

      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK,
            SK,
            entityType: "PLAYLIST_ITEM",
            playlistId,
            materialId,
            addedAt,
          },
        })
      );

      return sendResponse({ success: true, materialId }, 201);
    } catch (err) {
      console.error("addPlaylistItem: DynamoDB operation failed.", err);
      return sendError(500, "Could not add item to playlist.");
    }
  }
);
