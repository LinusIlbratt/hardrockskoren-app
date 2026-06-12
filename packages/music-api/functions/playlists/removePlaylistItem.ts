import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";
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
      console.error("removePlaylistItem: MAIN_TABLE is not configured.");
      return sendError(500, "Server configuration error.");
    }

    const uuid = event.requestContext.authorizer.lambda?.uuid?.trim();
    if (!uuid) {
      return sendError(401, "User identity is missing from the request context.");
    }

    const playlistId = event.pathParameters?.playlistId?.trim();
    const materialId = event.pathParameters?.materialId?.trim();
    if (!playlistId || !materialId) {
      return sendError(400, "playlistId and materialId are required in the path.");
    }

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

      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            PK: `PLAYLIST#${playlistId}`,
            SK: `MATERIAL#${materialId}`,
          },
        })
      );

      return sendResponse({ success: true }, 200);
    } catch (err) {
      console.error("removePlaylistItem: DynamoDB operation failed.", err);
      return sendError(500, "Could not remove item from playlist.");
    }
  }
);
