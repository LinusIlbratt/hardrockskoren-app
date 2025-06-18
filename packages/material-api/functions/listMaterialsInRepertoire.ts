import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";

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

    const command = new QueryCommand({
      TableName: MAIN_TABLE,
      // Hämta allt där SK börjar med REPERTOIRE#<id>#MATERIAL#
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `GROUP#${groupName}` },
        ":skPrefix": { S: `REPERTOIRE#${repertoireId}#MATERIAL#` },
      },
    });

    const { Items } = await dbClient.send(command);
    const materials = (Items || []).map(item => unmarshall(item));

    return sendResponse(materials, 200);

  } catch (error: any) {
    console.error("Error fetching materials:", error);
    return sendError(500, error.message);
  }
};