import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "@hrk/core/utils/http";
import type { AuthContext } from "@hrk/core/types";
import type { PlaylistResponse } from "./createPlaylist";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function itemToPlaylist(raw: Record<string, unknown>): PlaylistResponse | null {
  if (raw.entityType !== "PLAYLIST") {
    return null;
  }
  const playlistId = raw.playlistId;
  const title = raw.title;
  const createdAt = raw.createdAt;
  if (
    typeof playlistId !== "string" ||
    typeof title !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }
  const out: PlaylistResponse = {
    entityType: "PLAYLIST",
    playlistId,
    title,
    createdAt,
  };
  if (typeof raw.description === "string" && raw.description.trim() !== "") {
    out.description = raw.description;
  }
  return out;
}

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    const tableName = process.env.MAIN_TABLE;
    if (!tableName) {
      console.error("getPlaylists: MAIN_TABLE is not configured.");
      return sendError(500, "Server configuration error.");
    }

    const uuid = event.requestContext.authorizer.lambda?.uuid?.trim();
    if (!uuid) {
      return sendError(401, "User identity is missing from the request context.");
    }

    const pk = `USER#${uuid}`;
    const skPrefix = "PLAYLIST#";

    try {
      const playlists: PlaylistResponse[] = [];
      let exclusiveStartKey: Record<string, unknown> | undefined;

      do {
        const result = await docClient.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
            ExpressionAttributeValues: {
              ":pk": pk,
              ":skPrefix": skPrefix,
            },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );

        for (const raw of result.Items ?? []) {
          const pl = itemToPlaylist(raw as Record<string, unknown>);
          if (pl) {
            playlists.push(pl);
          }
        }

        exclusiveStartKey = result.LastEvaluatedKey as
          | Record<string, unknown>
          | undefined;
      } while (exclusiveStartKey);

      return sendResponse(playlists, 200);
    } catch (err) {
      console.error("getPlaylists: DynamoDB query failed.", err);
      return sendError(500, "Could not load playlists.");
    }
  }
);
