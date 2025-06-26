import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http"; 

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    // --- BORTTAGET ---
    // All logik för att hämta groupName är borttagen. Vi behöver den inte.

    // --- NYTT QUERY-KOMMANDO ---
    // Detta kommando siktar på GSI1 istället för huvudnyckeln.
    const command = new QueryCommand({
      TableName: MAIN_TABLE,
      IndexName: 'GSI1', // Specificera att vi frågar mot GSI1
      KeyConditionExpression: "GSI1PK = :gsi1pk", // Fråga efter vår statiska nyckel
      ExpressionAttributeValues: {
        ":gsi1pk": { S: "MATERIALS" }, // Hämta allt som har denna "etikett"
      },
      // Frivilligt: Sortera fallande så att de nyaste filerna kommer först
      ScanIndexForward: false, 
    });

    const { Items } = await dbClient.send(command);
    
    const materials = (Items || []).map(item => unmarshall(item));

    return sendResponse(materials, 200);

  } catch (error: any) {
    console.error("Error fetching all global materials:", error);
    return sendError(500, error.message || "Internal server error");
  }
};