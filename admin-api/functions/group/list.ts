import middy from "@middy/core";
import { sendResponse, sendError } from "../../../core/utils/http";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = middy().handler(
  async (
    event: APIGatewayProxyEventV2WithLambdaAuthorizer<any>
  ): Promise<APIGatewayProxyResultV2> => {
    try {
      // Hämta alla grupper från DynamoDB
      const scanCommand = new ScanCommand({
        TableName: process.env.MAIN_TABLE as string,
        FilterExpression: "begins_with(PK, :prefix) AND SK = :metadata",
        ExpressionAttributeValues: {
          ":prefix": { S: "GROUP#" },
          ":metadata": { S: "METADATA" },
        },
      });

      const response = await dbClient.send(scanCommand);
      const items = response.Items || [];

      // Avkodar dynamo-objekten till vanliga JS-objekt
      const groups = items.map(item => unmarshall(item));

      return sendResponse(groups, 200);
    } catch (error: any) {
      console.error("Error listing groups:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);
