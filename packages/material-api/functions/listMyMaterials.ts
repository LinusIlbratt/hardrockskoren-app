// material-api/functions/listMyMaterials.ts

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const client = new DynamoDBClient({ region: "eu-north-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!MAIN_TABLE) {
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error: Table name not set." }) };
  }

  try {
    // Hämta information som din authorizer har bifogat till requesten
    const userGroup = event.requestContext.authorizer?.lambda?.group;

    if (!userGroup) {
      console.error("User group not found in authorizer context", event.requestContext.authorizer);
      return { statusCode: 403, body: JSON.stringify({ message: "Forbidden: User group could not be determined." }) };
    }

    const command = new QueryCommand({
      TableName: MAIN_TABLE,
      // Hämta alla items där Partition Key (PK) matchar användarens grupp
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": `GROUP#${userGroup}`,
      },
    });

    const { Items } = await ddbDocClient.send(command);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(Items || []), // Returnera en tom lista om inga items hittades
    };
    
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error fetching materials.", error: message }),
    };
  }
};