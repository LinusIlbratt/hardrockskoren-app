import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    // Steg 1: Hämta groupSlug från sökvägen (path)
    const { groupSlug } = event.pathParameters || {};
    if (!groupSlug) {
      return sendError(400, "Group slug is required in the path.");
    }
    
    // Steg 2: Bygg upp en Query-kommando mot GSI1 för att få sorterad data
    const command = new QueryCommand({
      TableName: MAIN_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: "GSI1PK = :gsi1pk",
      
      ExpressionAttributeValues: {
        ":gsi1pk": { S: `GROUP#${groupSlug}` },
      },
    });

    // Steg 3: Skicka kommandot till DynamoDB
    const result = await dbClient.send(command);

    // Steg 4: Konvertera DynamoDB-formatet tillbaka till vanliga JSON-objekt
    const events = result.Items ? result.Items.map(item => unmarshall(item)) : [];

    // Steg 5: Skicka tillbaka den framgångsrika listan av events
    return sendResponse(events, 200);

  } catch (error: any) {
    console.error("Error fetching events:", error);
    return sendError(500, error.message || "Internal server error");
  }
};