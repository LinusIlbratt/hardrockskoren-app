import {
  DynamoDBClient,
  GetItemCommand,
  BatchGetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

const PK_VOICE_PLAYLISTS = "VOICE_PLAYLISTS";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    const { playlistId } = event.pathParameters || {};
    if (!playlistId) {
      return sendError(400, "Playlist ID is required.");
    }

    const getCommand = new GetItemCommand({
      TableName: MAIN_TABLE,
      Key: {
        PK: { S: PK_VOICE_PLAYLISTS },
        SK: { S: `PLAYLIST#${playlistId}` },
      },
    });

    const { Item } = await dbClient.send(getCommand);
    if (!Item) {
      return sendError(404, "Voice playlist not found.");
    }

    const playlist = unmarshall(Item);
    const trackOrder: string[] = playlist.trackOrder || [];

    if (trackOrder.length === 0) {
      return sendResponse({ ...playlist, tracks: [] }, 200);
    }

    const materialKeys = trackOrder.map((materialId: string) => ({
      PK: { S: `MATERIAL#${materialId}` },
      SK: { S: `MATERIAL#${materialId}` },
    }));

    const batchGetCommand = new BatchGetItemCommand({
      RequestItems: {
        [MAIN_TABLE]: { Keys: materialKeys },
      },
    });

    const { Responses } = await dbClient.send(batchGetCommand);
    const materials = (Responses?.[MAIN_TABLE] || []).map((item) =>
      unmarshall(item)
    );
    const materialMap = new Map(materials.map((m) => [m.materialId, m]));

    const tracks = trackOrder.map((materialId: string) => {
      const m = materialMap.get(materialId);
      return m
        ? {
            materialId: m.materialId,
            fileKey: m.fileKey,
            title: m.title || m.fileKey?.split("/").pop() || "Okänd",
          }
        : { materialId, fileKey: null, title: "Saknas" };
    });

    return sendResponse({ ...playlist, tracks }, 200);
  } catch (error: unknown) {
    console.error("Error getting voice playlist:", error);
    return sendError(
      500,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
};
