// material-api/functions/createMaterial.ts

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({ region: "eu-north-1" });
const ddbDocClient = DynamoDBDocumentClient.from(client);

const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!MAIN_TABLE) {
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error: Table name not set." }) };
  }

  try {
    const { groupName } = event.pathParameters || {};
    if (!groupName) {
      return { statusCode: 400, body: JSON.stringify({ message: "Group name is required in path." }) };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { title, fileKey } = body;

    if (!title || !fileKey) {
      return { statusCode: 400, body: JSON.stringify({ message: "title and fileKey are required in the request body." }) };
    }

    const materialId = randomUUID();
    const createdAt = new Date().toISOString();

    const item = {
      PK: `GROUP#${groupName}`, // T.ex. "GROUP#Sopran"
      SK: `MATERIAL#${materialId}`, // T.ex. "MATERIAL#123e4567-e89b-12d3-a456-426614174000"
      materialId,
      title,
      fileKey,
      createdAt,
      type: "Material", 
    };

    const command = new PutCommand({
      TableName: MAIN_TABLE,
      Item: item,
    });

    await ddbDocClient.send(command);

    return {
      statusCode: 201, // 201 Created
      body: JSON.stringify(item),
    };
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "An unknown error occurred.";
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error creating material.", error: message }),
    };
  }
};