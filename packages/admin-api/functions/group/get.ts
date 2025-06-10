import middy from "@middy/core";
import { sendResponse, sendError } from "../../../core/utils/http";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = middy().handler(
  async (
    event: APIGatewayProxyEventV2WithLambdaAuthorizer<any>
  ): Promise<APIGatewayProxyResultV2> => {
    try {
      // Kontrollera att name är inkluderat
      const groupName = event.pathParameters?.name;
      if (!groupName) {
        return sendError(400, "Group name is required.");
      }

      // Hämta gruppens metadata
      const getCommand = new GetItemCommand({
        TableName: process.env.MAIN_TABLE as string,
        Key: marshall({
          PK: `GROUP#${groupName}`,
          SK: "METADATA",
        }),
      });

      const response = await dbClient.send(getCommand);
      const item = response.Item;

      if (!item) {
        return sendError(404, "Group not found.");
      }

      // Avkodar dynamo-objektet till ett vanligt JS-objekt
      const group = unmarshall(item);

      return sendResponse(group, 200);
    } catch (error: any) {
      console.error("Error fetching group:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);
