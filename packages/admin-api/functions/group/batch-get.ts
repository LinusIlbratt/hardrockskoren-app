import { DynamoDBClient, BatchGetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { sendResponse, sendError } from "../../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (event: any) => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    if (!event.body) {
      return sendError(400, "Request body is required.");
    }
    const { groupSlugs } = JSON.parse(event.body);

    if (!Array.isArray(groupSlugs) || groupSlugs.length === 0) {
      return sendResponse([]); // Returnera en tom lista om inga slugs skickas
    }

    // Skapa en lista med nycklar att hämta från DynamoDB
    const keysToGet = groupSlugs.map(slug => ({
      PK: { S: `GROUP#${slug}` },
      SK: { S: `METADATA` } 
    }));

    const command = new BatchGetItemCommand({
      RequestItems: {
        [MAIN_TABLE]: {
          Keys: keysToGet,
        },
      },
    });

    const { Responses } = await dbClient.send(command);

    if (!Responses || !Responses[MAIN_TABLE]) {
      return sendResponse([]);
    }

    // Konvertera resultatet från DynamoDB-format till vanligt JSON-format
    const foundGroups = Responses[MAIN_TABLE].map(item => unmarshall(item));

    return sendResponse(foundGroups, 200);

  } catch (error: any) {
    console.error("Error in batch-get:", error);
    return sendError(500, error.message || "Internal server error");
  }
};
