import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "@hrk/core/utils/http";
import type { AuthContext } from "@hrk/core/types";
import type { PlaylistResponse } from "./createPlaylist";
import { verifyPlaylistOwnership } from "./verifyPlaylistOwnership";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    const tableName = process.env.MAIN_TABLE;
    if (!tableName) {
      console.error("updatePlaylist: MAIN_TABLE is not configured.");
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

    const titleRaw = body.title;
    if (typeof titleRaw !== "string" || titleRaw.trim() === "") {
      return sendError(400, "title is required and must be a non-empty string.");
    }
    const title = titleRaw.trim();

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

      const PK = `USER#${uuid}`;
      const SK = `PLAYLIST#${playlistId}`;

      const result = await docClient.send(
        new UpdateCommand({
          TableName: tableName,
          Key: { PK, SK },
          UpdateExpression: "SET #title = :title",
          ExpressionAttributeNames: { "#title": "title" },
          ExpressionAttributeValues: {
            ":title": title,
            ":et": "PLAYLIST",
          },
          ConditionExpression: "entityType = :et",
          ReturnValues: "ALL_NEW",
        })
      );

      const attrs = result.Attributes as Record<string, unknown> | undefined;
      if (!attrs) {
        return sendError(500, "Update returned no attributes.");
      }

      const out: PlaylistResponse = {
        entityType: "PLAYLIST",
        playlistId: String(attrs.playlistId),
        title: String(attrs.title),
        createdAt: String(attrs.createdAt),
      };
      if (
        typeof attrs.description === "string" &&
        attrs.description.trim() !== ""
      ) {
        out.description = attrs.description;
      }

      return sendResponse(out, 200);
    } catch (err: unknown) {
      const name = err && typeof err === "object" && "name" in err ? (err as { name?: string }).name : "";
      if (name === "ConditionalCheckFailedException") {
        return sendError(403, "Forbidden or Playlist not found");
      }
      console.error("updatePlaylist: DynamoDB operation failed.", err);
      return sendError(500, "Could not update playlist.");
    }
  }
);
