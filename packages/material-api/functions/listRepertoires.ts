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
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    const { groupName } = event.pathParameters || {};
    if (!groupName) {
      return sendError(400, "Group name is required in the path.");
    }

    const command = new QueryCommand({
      TableName: MAIN_TABLE,
      // Hämta alla items där PK matchar gruppen och SK börjar med REPERTOIRE#
      // Detta är det hierarkiska sök-mönstret i DynamoDB.
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `GROUP#${groupName}` },
        ":skPrefix": { S: "REPERTOIRE#" },
      },
    });

    const { Items } = await dbClient.send(command);
    
    // Vi vill bara returnera "mapparna" (låtarna), inte filerna inuti dem.
    // En fil har SK som ser ut så här: REPERTOIRE#<id>#MATERIAL#<id>
    // Vi filtrerar bort dem som innehåller #MATERIAL#.
    const repertoireItems = (Items || [])
      .filter(item => !item.SK.S?.includes('#MATERIAL#'))
      .map(item => unmarshall(item));

    return sendResponse(repertoireItems, 200);

  } catch (error: any) {
    console.error("Error fetching repertoire items:", error);
    return sendError(500, error.message || "Internal server error");
  }
};