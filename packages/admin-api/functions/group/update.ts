import middy from "@middy/core";
import { sendResponse, sendError } from "../../../core/utils/http";
import {
  normalizeGroupSlug,
  requireGroupAccessResponse,
} from "../../../core/utils/requireGroupAccess";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const NAME_MAX = 100;
const DESCRIPTION_MAX = 2000;

export const handler = middy().handler(
  async (
    event: APIGatewayProxyEventV2WithLambdaAuthorizer<any>
  ): Promise<APIGatewayProxyResultV2> => {
    try {
      const groupName = normalizeGroupSlug(event.pathParameters?.name);
      if (!groupName) {
        return sendError(400, "Group name is required.");
      }

      const accessError = await requireGroupAccessResponse(
        event.requestContext.authorizer?.lambda,
        groupName
      );
      if (accessError) {
        return accessError;
      }

      if (!event.body) {
        return sendError(400, "Request body is required.");
      }

      const updates = JSON.parse(event.body);
      const rawName = updates?.name;
      const rawDescription = updates?.description;

      let name: string | undefined;
      let description: string | undefined;

      if (rawName !== undefined && rawName !== null && rawName !== "") {
        if (typeof rawName !== "string") {
          return sendError(400, "Körnamnet måste vara en text.");
        }
        name = rawName.trim();
        if (!name) {
          return sendError(400, "Körnamnet måste vara en text.");
        }
        if (name.length > NAME_MAX) {
          return sendError(400, "Körnamnet får vara högst 100 tecken.");
        }
      }

      if (rawDescription !== undefined && rawDescription !== null && rawDescription !== "") {
        if (typeof rawDescription !== "string") {
          return sendError(400, "Beskrivningen måste vara en text.");
        }
        description = rawDescription.trim();
        if (description.length > DESCRIPTION_MAX) {
          return sendError(400, "Beskrivningen får vara högst 2000 tecken.");
        }
      }

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
        ConditionExpression: "attribute_exists(PK)",
        ReturnValues: "ALL_NEW",
      });

      const response = await dbClient.send(updateCommand);
      const updatedGroup = response.Attributes ? unmarshall(response.Attributes) : {};

      return sendResponse(updatedGroup, 200);
    } catch (error: any) {
      if (error?.name === "ConditionalCheckFailedException") {
        return sendError(404, "Kören hittades inte.");
      }
      console.error("Error updating group:", error);
      return sendError(500, "Ett internt serverfel uppstod");
    }
  }
);
