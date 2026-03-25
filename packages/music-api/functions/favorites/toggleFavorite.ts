import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "@hrk/core/utils/http";
import type { AuthContext } from "@hrk/core/types";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    const tableName = process.env.MAIN_TABLE;
    if (!tableName) {
      console.error("toggleFavorite: MAIN_TABLE is not configured.");
      return sendError(500, "Server configuration error.");
    }

    const uuid = event.requestContext.authorizer.lambda?.uuid?.trim();
    if (!uuid) {
      return sendError(401, "User identity is missing from the request context.");
    }

    const materialId = event.pathParameters?.materialId?.trim();
    if (!materialId) {
      return sendError(400, "materialId is required in the path.");
    }

    const PK = `USER#${uuid}`;
    const SK = `FAVORITE#${materialId}`;

    try {
      const existing = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK, SK },
          ConsistentRead: true,
        })
      );

      if (existing.Item) {
        await docClient.send(
          new DeleteCommand({
            TableName: tableName,
            Key: { PK, SK },
          })
        );

        return sendResponse({ isFavorite: false, materialId }, 200);
      }

      const createdAt = new Date().toISOString();

      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: {
            PK,
            SK,
            entityType: "FAVORITE",
            materialId,
            createdAt,
          },
        })
      );

      return sendResponse({ isFavorite: true, materialId }, 200);
    } catch (err) {
      console.error("toggleFavorite: DynamoDB operation failed.", err);
      return sendError(500, "Could not update favorite.");
    }
  }
);
