import { AttributeValue, DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import { requireGroupAccessResponse } from "../../../core/utils/requireGroupAccess";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;
const MAX_QUERY_PAGES = 200;

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    const { groupSlug } = event.pathParameters || {};
    const authDenied = await requireGroupAccessResponse(
      event.requestContext.authorizer?.lambda,
      groupSlug
    );
    if (authDenied) return authDenied;

    const events: Record<string, unknown>[] = [];
    let startKey: Record<string, AttributeValue> | undefined;
    let pages = 0;

    do {
      if (pages >= MAX_QUERY_PAGES) {
        console.error("listEvents: query page limit reached", { groupSlug, pages });
        return sendError(500, "Kunde inte hämta hela eventlistan.");
      }
      const result = await dbClient.send(
        new QueryCommand({
          TableName: MAIN_TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :gsi1pk",
          ExpressionAttributeValues: {
            ":gsi1pk": { S: `GROUP#${groupSlug}` },
          },
          ExclusiveStartKey: startKey,
        })
      );
      for (const item of result.Items ?? []) {
        events.push(unmarshall(item));
      }
      startKey = result.LastEvaluatedKey;
      pages += 1;
    } while (startKey);

    return sendResponse(events, 200);

  } catch (error: any) {
    console.error("Error fetching events:", error);
    return sendError(500, "Ett internt serverfel uppstod");
  }
};