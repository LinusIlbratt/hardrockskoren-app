import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
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
    const command = new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: PK_VOICE_PLAYLISTS },
        ":skPrefix": { S: "PLAYLIST#" },
      },
    });

    const { Items } = await dbClient.send(command);
    const playlists = (Items || []).map((item) => unmarshall(item));

    return sendResponse(playlists, 200);
  } catch (error: unknown) {
    console.error("Error listing voice playlists:", error);
    return sendError(
      500,
      error instanceof Error ? error.message : "Internal server error"
    );
  }
};
