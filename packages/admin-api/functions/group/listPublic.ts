// admin-api/groups/listPublic.ts

import middy from "@middy/core";
import { sendResponse, sendError } from "../../../core/utils/http";
import {
  APIGatewayProxyEventV2, // Ändrad till en enklare typ då vi inte behöver authorizer-data
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Denna funktion är avsedd att exponeras för alla inloggade användare (user, leader).
export const handler = middy().handler(
  async (
    event: APIGatewayProxyEventV2
  ): Promise<APIGatewayProxyResultV2> => {
    try {
      const scanCommand = new ScanCommand({
        TableName: process.env.MAIN_TABLE as string,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :metadata",
        ExpressionAttributeValues: {
          ":prefix": { S: "GROUP#" },
          ":metadata": { S: "METADATA" },
        },
        // FÖRBÄTTRING: Detta är den viktiga ändringen.
        // Vi talar om för DynamoDB att BARA hämta dessa tre attribut.
        // Detta är både säkrare och mer kostnadseffektivt.
        ProjectionExpression: "#n, #s, #l , #c",
        ExpressionAttributeNames: {
          "#n": "name",
          "#s": "slug",
          "#l": "location",
          "#c": "choirLeader",
        },
      });

      const response = await dbClient.send(scanCommand);
      const items = response.Items || [];
      
      const groups = items.map(item => unmarshall(item));

      return sendResponse(groups, 200);
    } catch (error: any) {
      console.error("Error listing public groups:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);