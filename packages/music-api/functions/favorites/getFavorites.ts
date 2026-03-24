import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "@hrk/core/utils/http";
import type { AuthContext } from "@hrk/core/types";
import {
  batchGetGlobalMaterialsByIds,
  hasRequiredMaterialFields,
  sanitizeMaterialForClient,
} from "../lib/batchGetGlobalMaterials";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function materialIdFromItem(item: Record<string, unknown>): string | null {
  const mid = item.materialId;
  if (typeof mid === "string" && mid.trim() !== "") {
    return mid.trim();
  }
  const sk = item.SK;
  if (typeof sk === "string" && sk.startsWith("FAVORITE#")) {
    return sk.slice("FAVORITE#".length);
  }
  return null;
}

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    const tableName = process.env.MAIN_TABLE;
    if (!tableName) {
      console.error("getFavorites: MAIN_TABLE is not configured.");
      return sendError(500, "Server configuration error.");
    }

    const uuid = event.requestContext.authorizer.lambda?.uuid?.trim();
    if (!uuid) {
      return sendError(401, "User identity is missing from the request context.");
    }

    const pk = `USER#${uuid}`;
    const skPrefix = "FAVORITE#";

    try {
      const materialIds: string[] = [];
      let exclusiveStartKey: Record<string, unknown> | undefined;

      do {
        const result = await docClient.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
            ExpressionAttributeValues: {
              ":pk": pk,
              ":skPrefix": skPrefix,
            },
            ExclusiveStartKey: exclusiveStartKey,
          })
        );

        for (const raw of result.Items ?? []) {
          const id = materialIdFromItem(raw as Record<string, unknown>);
          if (id) {
            materialIds.push(id);
          }
        }

        exclusiveStartKey = result.LastEvaluatedKey as
          | Record<string, unknown>
          | undefined;
      } while (exclusiveStartKey);

      if (materialIds.length === 0) {
        return sendResponse([], 200);
      }

      const byId = await batchGetGlobalMaterialsByIds(
        docClient,
        tableName,
        materialIds
      );

      const hydrated: Record<string, unknown>[] = [];
      for (const id of materialIds) {
        const raw = byId.get(id);
        if (!raw) {
          continue;
        }
        const clean = sanitizeMaterialForClient(raw);
        if (!hasRequiredMaterialFields(clean)) {
          continue;
        }
        hydrated.push(clean);
      }

      return sendResponse(hydrated, 200);
    } catch (err) {
      console.error("getFavorites: DynamoDB operation failed.", err);
      return sendError(500, "Could not load favorites.");
    }
  }
);
