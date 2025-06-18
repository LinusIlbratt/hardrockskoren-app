import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error.");
  }

  try {
    const { groupName, repertoireId } = event.pathParameters || {};
    if (!groupName || !repertoireId) {
      return sendError(400, "Group name and Repertoire ID are required.");
    }

    if (!event.body) {
      return sendError(400, "Request body is required.");
    }
    const { title, fileKey } = JSON.parse(event.body);
    if (!title || !fileKey) {
        return sendError(400, "Title and fileKey are required.");
    }

    const materialId = nanoid();
    const item = {
      PK: `GROUP#${groupName}`,
      // Den nya, hierarkiska sorteringsnyckeln!
      SK: `REPERTOIRE#${repertoireId}#MATERIAL#${materialId}`,
      materialId,
      repertoireId, // Bra att spara för framtida sökningar
      title,
      fileKey,
      createdAt: new Date().toISOString(),
      type: "Material",
    };

    const command = new PutItemCommand({
      TableName: MAIN_TABLE,
      Item: marshall(item),
    });

    await dbClient.send(command);

    return sendResponse({ message: "Material created and linked to repertoire.", item }, 201);

  } catch (error: any) {
    console.error("Error creating material:", error);
    return sendError(500, error.message);
  }
};