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
    return sendError(500, "Server configuration error: MAIN_TABLE not set.");
  }

  try {
    // Förbered en Query-operation för att hämta allt med en specifik PK
    const queryCommand = new QueryCommand({
      TableName: MAIN_TABLE,
      // KeyConditionExpression specificerar vilket villkor som ska matchas.
      // Här säger vi "där Partition Key (PK) är lika med värdet :pk".
      KeyConditionExpression: "PK = :pk",
      
      // ExpressionAttributeValues är där vi definierar vad platshållaren :pk betyder.
      ExpressionAttributeValues: {
        ":pk": { S: "SJUNGUPP#MATERIALS" },
      },
    });

    const { Items } = await dbClient.send(queryCommand);

    // Omvandla DynamoDB:s format till vanlig JSON
    const materials = (Items || []).map(item => unmarshall(item));

    return sendResponse(materials, 200);

  } catch (error: any) {
    console.error("Error fetching Sjungupp materials:", error);
    return sendError(500, error.message);
  }
};