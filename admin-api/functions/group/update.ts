import middy from "@middy/core";
import { sendResponse, sendError } from "../../../core/utils/http";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export const handler = middy().handler(
  async (
    event: APIGatewayProxyEventV2WithLambdaAuthorizer<any>
  ): Promise<APIGatewayProxyResultV2> => {
    try {
      // Kontrollera att name är inkluderat
      const groupName = event.queryStringParameters?.name;
      if (!groupName) {
        return sendError(400, "Group name is required.");
      }

      if (!event.body) {
        return sendError(400, "Request body is required.");
      }

      const updates = JSON.parse(event.body);
      const { name, description } = updates;

      // Validera att minst ett fält är med
      if (!name && !description) {
        return sendError(400, "At least one of 'name' or 'description' is required.");
      }

      // Bygg update expression
      const updateExpressions = [];
      const expressionAttributeNames = {};
      const expressionAttributeValues = {};

      if (name) {
        updateExpressions.push("#name = :name");
        expressionAttributeNames["#name"] = "name";
        expressionAttributeValues[":name"] = name;
      }

      if (description) {
        updateExpressions.push("#description = :description");
        expressionAttributeNames["#description"] = "description";
        expressionAttributeValues[":description"] = description;
      }

      // Lägg till uppdateringsdatum
      updateExpressions.push("#updatedAt = :updatedAt");
      expressionAttributeNames["#updatedAt"] = "updatedAt";
      expressionAttributeValues[":updatedAt"] = new Date().toISOString();

      const updateCommand = new UpdateItemCommand({
        TableName: process.env.MAIN_TABLE as string,
        Key: marshall({
          PK: `GROUP#${groupName}`,
          SK: "METADATA",
        }),
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        ReturnValues: "ALL_NEW",
      });

      const response = await dbClient.send(updateCommand);
      const updatedGroup = response.Attributes ? marshall(response.Attributes) : {};

      return sendResponse(updatedGroup, 200);
    } catch (error: any) {
      console.error("Error updating group:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);
