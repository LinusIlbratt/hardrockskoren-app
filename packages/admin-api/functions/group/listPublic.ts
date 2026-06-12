// admin-api/groups/listPublic.ts

import middy from "@middy/core";
import { sendResponse, sendError } from "../../../core/utils/http";
import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = middy().handler(
  async (
    event: APIGatewayProxyEventV2
  ): Promise<APIGatewayProxyResultV2> => {
    try {
      const allItems: Record<string, AttributeValue>[] = [];
      let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

      do {
        const scanCommand = new ScanCommand({
          TableName: process.env.MAIN_TABLE as string,
          FilterExpression: "begins_with(PK, :prefix) AND SK = :metadata",
          ExpressionAttributeValues: {
            ":prefix": { S: "GROUP#" },
            ":metadata": { S: "METADATA" },
          },
          ProjectionExpression: "#n, #s, #l, #c",
          ExpressionAttributeNames: {
            "#n": "name",
            "#s": "slug",
            "#l": "location",
            "#c": "choirLeader",
          },
          ExclusiveStartKey: lastEvaluatedKey,
        });

        const response = await dbClient.send(scanCommand);
        allItems.push(...(response.Items || []));
        lastEvaluatedKey = response.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      const groups = allItems.map(item => unmarshall(item));

      return sendResponse(groups, 200);
    } catch (error: any) {
      console.error("Error listing public groups:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);