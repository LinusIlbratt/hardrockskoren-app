import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    const { groupName, materialId } = event.pathParameters || {};
    if (!groupName || !materialId) {
      return sendError(400, "Group name and Material ID are required in the path.");
    }

    const command = new DeleteItemCommand({
      TableName: MAIN_TABLE,
      // Specificera den exakta nyckeln för det objekt som ska raderas
      Key: {
        PK: { S: `GROUP#${groupName}` },
        SK: { S: `MATERIAL#${materialId}` },
      },
    });

    await dbClient.send(command);

    return sendResponse({ message: "Material deleted successfully." }, 200);

  } catch (error: any) {
    console.error("Error deleting material:", error);
    return sendError(500, error.message || "Internal server error");
  }
};