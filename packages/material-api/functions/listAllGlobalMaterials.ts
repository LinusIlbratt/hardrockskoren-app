import {
  DynamoDBClient,
  QueryCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
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
    const materials: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;

    do {
      const command = new QueryCommand({
        TableName: MAIN_TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": { S: "MATERIALS" },
        },
        ScanIndexForward: false,
        ExclusiveStartKey: exclusiveStartKey,
      });

      const { Items, LastEvaluatedKey } = await dbClient.send(command);

      for (const item of Items ?? []) {
        materials.push(unmarshall(item));
      }

      exclusiveStartKey = LastEvaluatedKey;
    } while (exclusiveStartKey);

    return sendResponse(materials, 200);
  } catch (error: any) {
    console.error("Error fetching all global materials:", error);
    return sendError(500, error.message || "Internal server error");
  }
};
