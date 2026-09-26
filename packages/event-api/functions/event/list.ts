import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
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

    const command = new QueryCommand({
      TableName: MAIN_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: "GSI1PK = :gsi1pk",
      
      ExpressionAttributeValues: {
        ":gsi1pk": { S: `GROUP#${groupSlug}` },
      },
    });

    const result = await dbClient.send(command);

    const events = result.Items ? result.Items.map(item => unmarshall(item)) : [];

    return sendResponse(events, 200);

  } catch (error: any) {
    console.error("Error fetching events:", error);
    return sendError(500, error.message || "Internal server error");
  }
};