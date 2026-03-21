import {
  DynamoDBClient,
  PutItemCommand,
  BatchGetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import { nanoid } from "nanoid";

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

    if (!event.body) {
      return sendError(400, "Request body is required.");
    }

    const body = JSON.parse(event.body);
    const { title, trackOrder } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return sendError(400, "Title is required and must be a non-empty string.");
    }

    const materialIds = Array.isArray(trackOrder)
      ? trackOrder.filter((id): id is string => typeof id === "string")
      : [];

    if (materialIds.length > 0) {
      const keys = materialIds.map((id: string) => ({
        PK: { S: `MATERIAL#${id}` },
        SK: { S: `MATERIAL#${id}` },
      }));

      const batchGetCommand = new BatchGetItemCommand({
        RequestItems: { [MAIN_TABLE]: { Keys: keys } },
      });

      const { Responses } = await dbClient.send(batchGetCommand);
      const found = Responses?.[MAIN_TABLE]?.length ?? 0;
      if (found !== materialIds.length) {
        return sendError(
          400,
          "One or more material IDs do not exist in the global material library."
        );
      }
    }

    const playlistId = nanoid();
    const item = {
      PK: PK_VOICE_PLAYLISTS,
      SK: `PLAYLIST#${playlistId}`,
      playlistId,
      title: title.trim(),
      trackOrder: materialIds,
      createdAt: new Date().toISOString(),
      type: "VoicePlaylist",
    };

    const putCommand = new PutItemCommand({
      TableName: MAIN_TABLE,
      Item: marshall(item),
    });

    await dbClient.send(putCommand);

    return sendResponse({ message: "Voice playlist created.", item }, 201);
  } catch (error: unknown) {
    console.error("Error creating voice playlist:", error);
    return sendError(
      500,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
};
