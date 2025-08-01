import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http"; // Antager att ni har dessa hjälpfunktioner

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }
  
  // Hämta sökvägen från query string, t.ex. /api/materials-by-path?path=IRON-MAIDEN/
  const folderPath = event.queryStringParameters?.path;
  if (!folderPath) {
    return sendError(400, "Query parameter 'path' is required.");
  }

  try {
    const command = new QueryCommand({
      TableName: MAIN_TABLE,
      IndexName: 'GSI2', // Använd det nya, optimerade indexet
      KeyConditionExpression: "GSI1PK = :gsi1pk AND begins_with(filePath, :folderPath)",
      ExpressionAttributeValues: {
        ":gsi1pk": { S: "MATERIALS" },
        ":folderPath": { S: folderPath },
      },
      // Sortera på sökväg för en förutsägbar ordning
      ScanIndexForward: true,
    });

    const { Items } = await dbClient.send(command);
    const materials = (Items || []).map(item => unmarshall(item));

    return sendResponse(materials, 200);

  } catch (error: any) {
    console.error(`Error fetching materials for path ${folderPath}:`, error);
    return sendError(500, error.message || "Internal server error");
  }
};