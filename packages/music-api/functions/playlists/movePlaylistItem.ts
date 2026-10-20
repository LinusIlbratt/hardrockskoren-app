import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "@hrk/core/utils/http";
import type { AuthContext } from "@hrk/core/types";
import { verifyPlaylistOwnership } from "./verifyPlaylistOwnership";
import {
  planMoveSwap,
  type MoveDirection,
  type PlaylistOrderRow,
} from "./playlistOrder";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const MAX_PLAYLIST_ID_LEN = 64;
const MAX_MATERIAL_ID_LEN = 128;

function parseDirection(value: unknown): MoveDirection | null {
  if (value === "up" || value === "down") return value;
  return null;
}

function rowFromItem(raw: Record<string, unknown>): PlaylistOrderRow | null {
  if (raw.entityType !== "PLAYLIST_ITEM") return null;
  const materialId = raw.materialId;
  const addedAt = raw.addedAt;
  if (typeof materialId !== "string" || typeof addedAt !== "string") {
    return null;
  }
  const row: PlaylistOrderRow = { materialId, addedAt };
  if (typeof raw.orderKey === "string" && raw.orderKey.trim() !== "") {
    row.orderKey = raw.orderKey.trim();
  }
  return row;
}

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    const tableName = process.env.MAIN_TABLE;
    if (!tableName) {
      console.error("movePlaylistItem: MAIN_TABLE is not configured.");
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
    if (playlistId.length > MAX_PLAYLIST_ID_LEN || materialId.length > MAX_MATERIAL_ID_LEN) {
      return sendError(400, "playlistId or materialId is invalid.");
    }

    if (!event.body?.trim()) {
      return sendError(400, "Request body is required.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(event.body);
    } catch {
      return sendError(400, "Invalid JSON body.");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return sendError(400, "Request body must be an object.");
    }
    const body = parsed as Record<string, unknown>;

    const direction = parseDirection(body.direction);
    if (!direction) {
      return sendError(400, 'direction must be "up" or "down".');
    }

    const allowedKeys = new Set(["direction"]);
    for (const key of Object.keys(body)) {
      if (!allowedKeys.has(key)) {
        return sendError(400, `Unknown field: ${key}`);
      }
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
      const rows: PlaylistOrderRow[] = [];
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
          const row = rowFromItem(raw as Record<string, unknown>);
          if (row) rows.push(row);
        }

        exclusiveStartKey = result.LastEvaluatedKey as
          | Record<string, unknown>
          | undefined;
      } while (exclusiveStartKey);

      const plan = planMoveSwap(rows, materialId, direction);
      if (!plan) {
        return sendError(400, "Cannot move item in that direction.");
      }

      const et = "PLAYLIST_ITEM";
      /**
       * Byt orderKey mellan två spår. Condition tillåter legacy utan orderKey
       * (attribute_not_exists) eller exakt förväntad nyckel.
       */
      await docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: tableName,
                Key: {
                  PK: pk,
                  SK: `MATERIAL#${plan.current.materialId}`,
                },
                UpdateExpression: "SET orderKey = :nextOk",
                ConditionExpression:
                  "entityType = :et AND (attribute_not_exists(orderKey) OR orderKey = :curOk)",
                ExpressionAttributeValues: {
                  ":et": et,
                  ":nextOk": plan.current.nextOrderKey,
                  ":curOk": plan.current.currentOrderKey,
                },
              },
            },
            {
              Update: {
                TableName: tableName,
                Key: {
                  PK: pk,
                  SK: `MATERIAL#${plan.neighbor.materialId}`,
                },
                UpdateExpression: "SET orderKey = :nextOk",
                ConditionExpression:
                  "entityType = :et AND (attribute_not_exists(orderKey) OR orderKey = :curOk)",
                ExpressionAttributeValues: {
                  ":et": et,
                  ":nextOk": plan.neighbor.nextOrderKey,
                  ":curOk": plan.neighbor.currentOrderKey,
                },
              },
            },
          ],
        })
      );

      return sendResponse(
        {
          success: true,
          materialId,
          direction,
          swappedWith: plan.neighbor.materialId,
        },
        200
      );
    } catch (err: unknown) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: string }).name)
          : "";
      if (
        name === "TransactionCanceledException" ||
        name === "ConditionalCheckFailedException"
      ) {
        return sendError(
          409,
          "Spellistan ändrades samtidigt. Uppdatera och försök igen."
        );
      }
      console.error("movePlaylistItem: DynamoDB operation failed.", err);
      return sendError(500, "Could not move playlist item.");
    }
  }
);
