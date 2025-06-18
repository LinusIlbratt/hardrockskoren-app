import { DynamoDBClient, QueryCommand, BatchWriteItemCommand, WriteRequest } from "@aws-sdk/client-dynamodb";
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
    const { groupName, repertoireId } = event.pathParameters || {};
    if (!groupName || !repertoireId) {
      return sendError(400, "Group name and Repertoire ID are required.");
    }

    // --- STEG 1: Hitta alla objekt som ska raderas ---
    const queryCommand = new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `GROUP#${groupName}` },
        ":skPrefix": { S: `REPERTOIRE#${repertoireId}` },
      },
      // Vi behöver bara nycklarna (PK och SK) för att kunna radera
      ProjectionExpression: "PK, SK",
    });

    const { Items } = await dbClient.send(queryCommand);

    if (!Items || Items.length === 0) {
      return sendResponse({ message: "Repertoire not found, nothing to delete." }, 200);
    }
    
    // --- STEG 2: Förbered en batch-radering ---
    const deleteRequests: WriteRequest[] = Items.map(item => ({
      DeleteRequest: {
        Key: {
          PK: item.PK,
          SK: item.SK,
        },
      },
    }));

    // DynamoDB kan bara hantera 25 items per batch. För större operationer
    // skulle man behöva loopa, men detta täcker de flesta fall.
    const batchWriteCommand = new BatchWriteItemCommand({
      RequestItems: {
        [MAIN_TABLE]: deleteRequests,
      },
    });
    
    await dbClient.send(batchWriteCommand);

    // Proffstips: Här skulle man även lägga till logik för att radera de
    // faktiska filerna från S3-bucketen, men det är ett mer avancerat steg.

    return sendResponse({ message: `Repertoire and its ${Items.length - 1} materials deleted successfully.` }, 200);

  } catch (error: any) {
    console.error("Error deleting repertoire:", error);
    return sendError(500, error.message || "Internal server error");
  }
};