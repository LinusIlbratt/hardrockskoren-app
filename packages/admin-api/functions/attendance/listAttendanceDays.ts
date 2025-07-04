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

        // Hämta alla objekt för den givna gruppen
        const queryCommand = new QueryCommand({
          TableName: tableName,
          IndexName: indexName,
          KeyConditionExpression: "groupSlug = :slug",
          ExpressionAttributeValues: {
            ":slug": groupSlug,
          },
          // Vi behöver bara hämta datum-fältet, vilket är mycket effektivt
          ProjectionExpression: "#dateKey",
          ExpressionAttributeNames: {
            "#dateKey": "date",
          },
        });

        const { Items } = await docClient.send(queryCommand);

        if (!Items || Items.length === 0) {
          return sendResponse({ attendanceDays: [] });
        }

        // Skapa en lista med unika datum
        const uniqueDates = [...new Set(Items.map(item => item.date))];
        
        // Sortera datumen, med det senaste först
        uniqueDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

        // Formatera om till det objekt som frontend förväntar sig
        const formattedDays = uniqueDates.map(date => ({ date }));

        return sendResponse({ attendanceDays: formattedDays });

      } catch (error: any) {
        console.error("Misslyckades att hämta närvarodagar:", error);
        return sendError(500, "Internal server error.");
      }
    }
  );