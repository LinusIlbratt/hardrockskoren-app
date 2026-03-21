import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  BatchGetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

const PK_VOICE_PLAYLISTS = "VOICE_PLAYLISTS";

type AuthorizedEvent = APIGatewayProxyEvent & {
  requestContext: { authorizer: { lambda: { role?: string } } };
};

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    const allowedRoles = ["admin"];
    const userRole = event.requestContext.authorizer?.lambda?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    const { playlistId } = event.pathParameters || {};
    if (!playlistId) {
      return sendError(400, "Playlist ID is required.");
    }

    if (!event.body) {
      return sendError(400, "Request body is required.");
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

    const existing = unmarshall(Item);
    const body = JSON.parse(event.body);
    const title = body.title != null ? String(body.title).trim() : existing.title;
    const trackOrder = body.trackOrder !== undefined
      ? (Array.isArray(body.trackOrder)
          ? body.trackOrder.filter((id: unknown): id is string => typeof id === "string")
          : [])
      : existing.trackOrder;

    if (title === "") {
      return sendError(400, "Title cannot be empty.");
    }

    if (trackOrder.length > 0) {
      const keys = trackOrder.map((id: string) => ({
        PK: { S: `MATERIAL#${id}` },
        SK: { S: `MATERIAL#${id}` },
      }));

      const batchGetCommand = new BatchGetItemCommand({
        RequestItems: { [MAIN_TABLE]: { Keys: keys } },
      });

      const { Responses } = await dbClient.send(batchGetCommand);
      const found = Responses?.[MAIN_TABLE]?.length ?? 0;
      if (found !== trackOrder.length) {
        return sendError(
          400,
          "One or more material IDs do not exist in the global material library."
        );
      }
    }

    const updated = {
      ...existing,
      title,
      trackOrder,
      updatedAt: new Date().toISOString(),
    };

    const putCommand = new PutItemCommand({
      TableName: MAIN_TABLE,
      Item: marshall(updated),
    });

    await dbClient.send(putCommand);

    return sendResponse({ message: "Voice playlist updated.", item: updated }, 200);
  } catch (error: unknown) {
    console.error("Error updating voice playlist:", error);
    return sendError(
      500,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
};
