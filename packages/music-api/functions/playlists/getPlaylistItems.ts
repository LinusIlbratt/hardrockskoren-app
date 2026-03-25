import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "@hrk/core/utils/http";
import type { AuthContext } from "@hrk/core/types";
import { verifyPlaylistOwnership } from "./verifyPlaylistOwnership";
import {
  batchGetGlobalMaterialsByIds,
  hasRequiredMaterialFields,
  sanitizeMaterialForClient,
} from "../lib/batchGetGlobalMaterials";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

type PlaylistItemRow = {
  materialId: string;
  addedAt: string;
};

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function itemToRow(raw: Record<string, unknown>): PlaylistItemRow | null {
  if (raw.entityType !== "PLAYLIST_ITEM") {
    return null;
  }
  const materialId = raw.materialId;
  const addedAt = raw.addedAt;
  if (typeof materialId !== "string" || typeof addedAt !== "string") {
    return null;
  }
  return { materialId, addedAt };
}

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    const tableName = process.env.MAIN_TABLE;
    if (!tableName) {
      console.error("getPlaylistItems: MAIN_TABLE is not configured.");
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

      const rows: PlaylistItemRow[] = [];
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
          const row = itemToRow(raw as Record<string, unknown>);
          if (row) {
            rows.push(row);
          }
        }

        exclusiveStartKey = result.LastEvaluatedKey as
          | Record<string, unknown>
          | undefined;
      } while (exclusiveStartKey);

      if (rows.length === 0) {
        return sendResponse([], 200);
      }

      const materialIds = rows.map((r) => r.materialId);
      const byId = await batchGetGlobalMaterialsByIds(
        docClient,
        tableName,
        materialIds
      );

      const merged: {
        materialId: string;
        addedAt: string;
        material: Record<string, unknown>;
      }[] = [];

      for (const row of rows) {
        const raw = byId.get(row.materialId);
        if (!raw) {
          continue;
        }
        const clean = sanitizeMaterialForClient(raw);
        if (!hasRequiredMaterialFields(clean)) {
          continue;
        }
        merged.push({
          materialId: row.materialId,
          addedAt: row.addedAt,
          material: clean,
        });
      }

      return sendResponse(merged, 200);
    } catch (err) {
      console.error("getPlaylistItems: DynamoDB operation failed.", err);
      return sendError(500, "Could not load playlist items.");
    }
  }
);
