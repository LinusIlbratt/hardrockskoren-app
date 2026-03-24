import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
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
      console.error("deletePlaylist: MAIN_TABLE is not configured.");
      return sendError(500, "Server configuration error.");
    }

    const uuid = event.requestContext.authorizer.lambda?.uuid?.trim();
    if (!uuid) {
      return sendError(401, "User identity is missing from the request context.");
    }

    const rawPlaylistId = event.pathParameters?.playlistId?.trim();
    if (!rawPlaylistId) {
      return sendError(400, "playlistId is required in the path.");
    }
    let playlistId = rawPlaylistId;
    try {
      playlistId = decodeURIComponent(rawPlaylistId);
    } catch {
      playlistId = rawPlaylistId;
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

      const pk = `PLAYLIST#${playlistId}`;
      const skPrefix = "MATERIAL#";

      /**
       * Radera alla PLAYLIST_ITEM under PK utan att återanvända LastEvaluatedKey
       * efter Delete — det kan ge ValidationException / hoppade rader i DynamoDB.
       * Upprepa Query från början tills inga rader kvar.
       */
      const queryBatchLimit = 100;
      for (;;) {
        const result = await docClient.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
            ExpressionAttributeValues: {
              ":pk": pk,
              ":skPrefix": skPrefix,
            },
            Limit: queryBatchLimit,
          })
        );

        const batch = result.Items ?? [];
        if (batch.length === 0) {
          break;
        }

        for (const raw of batch) {
          const item = raw as { PK?: string; SK?: string };
          if (typeof item.PK !== "string" || typeof item.SK !== "string") {
            continue;
          }
          await docClient.send(
            new DeleteCommand({
              TableName: tableName,
              Key: { PK: item.PK, SK: item.SK },
            })
          );
        }
      }

      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: {
            PK: `USER#${uuid}`,
            SK: `PLAYLIST#${playlistId}`,
          },
        })
      );

      return sendResponse({ success: true, playlistId }, 200);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: string }).name)
          : "";
      console.error("deletePlaylist: DynamoDB operation failed.", msg, err);
      return sendError(500, "Could not delete playlist.");
    }
  }
);
