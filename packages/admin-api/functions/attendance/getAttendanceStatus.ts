import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { sendResponse, sendError } from "../../../core/utils/http";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../../core/types/auth";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.ATTENDANCE_TABLE_NAME;
const indexName = "GroupDateIndex";

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>()
  .handler(
    async (event: AuthorizedEvent): Promise<APIGatewayProxyResultV2> => {
      if (!tableName) {
        return sendError(500, "Serverkonfigurationen är ofullständig.");
      }
      
      try {
        const invokerRole = event.requestContext.authorizer.lambda.role;
        if (invokerRole !== "admin" && invokerRole !== "leader") {
          return sendError(403, "Forbidden.");
        }

        const groupSlug = event.pathParameters?.groupSlug;
        if (!groupSlug) {
          return sendError(400, "Grupp-ID saknas i URL:en.");
        }
        
        const today = new Date().toLocaleDateString('sv-SE');
        const now = Math.floor(Date.now() / 1000);

        const queryCommand = new QueryCommand({
          TableName: tableName,
          IndexName: indexName,
          KeyConditionExpression: "groupSlug = :slug AND #dateKey = :dateValue",
          FilterExpression: "expiresAt > :now",
          ExpressionAttributeNames: { "#dateKey": "date" },
          ExpressionAttributeValues: {
            ":slug": groupSlug,
            ":dateValue": today,
            ":now": now,
          },
        });

        const { Items } = await docClient.send(queryCommand);

        if (Items && Items.length > 0) {
          const activeSession = Items[0];
          return sendResponse({ 
            isActive: true,
            attendanceCode: activeSession.attendanceCode,
            expiresAt: activeSession.expiresAt 
          }, 200);
        }

        return sendResponse({ isActive: false }, 200);

      } catch (error: any) {
        console.error("Misslyckades att hämta närvarostatus:", error);
        return sendError(500, "Internal server error.");
      }
    }
  );
