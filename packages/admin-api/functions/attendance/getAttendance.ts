// admin-api/attendance/getAttendance.ts

import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { sendResponse, sendError } from "../../../core/utils/http";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../../core/types/auth";

// --- TypeScript Typer ---

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

// --- Initialisering ---

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.ATTENDANCE_TABLE_NAME;
const indexName = "GroupDateIndex"; // Vi använder vårt nya GSI

// --- Lambda Handler med Middy ---

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>()
  .handler(
    async (event: AuthorizedEvent): Promise<APIGatewayProxyResultV2> => {
      if (!tableName) {
        console.error("Miljövariabeln ATTENDANCE_TABLE_NAME är inte satt.");
        return sendError(500, "Serverkonfigurationen är ofullständig.");
      }

      try {
        // STEG 1: AUKTORISERING
        const invokerRole = event.requestContext.authorizer.lambda.role;
        if (invokerRole !== "admin" && invokerRole !== "leader") {
          return sendError(403, "Forbidden: You do not have permission to view attendance lists.");
        }

        // STEG 2: HÄMTA GRUPP OCH DATUM FRÅN URL
        const groupSlug = event.pathParameters?.groupSlug;
        const attendanceDate = event.pathParameters?.date;

        if (!groupSlug || !attendanceDate) {
          return sendError(400, "Grupp och/eller datum saknas i URL:en. Förväntat format: /groups/{groupSlug}/attendance/{date}");
        }

        console.log(`Hämtar närvarolista för grupp: ${groupSlug} och datum: ${attendanceDate}`);

        // STEG 3: HÄMTA ALLA SESSIONER FÖR GRUPP OCH DATUM VIA GSI
        const queryCommand = new QueryCommand({
          TableName: tableName,
          IndexName: indexName,
          KeyConditionExpression: "groupSlug = :slug AND #dateKey = :dateValue",
          ExpressionAttributeNames: {
            "#dateKey": "date",
          },
          ExpressionAttributeValues: {
            ":slug": groupSlug,
            ":dateValue": attendanceDate,
          },
        });

        const { Items } = await docClient.send(queryCommand);

        if (!Items || Items.length === 0) {
          return sendResponse({ presentMembers: [] });
        }

        // STEG 4: SAMMANFOGA ALLA NÄRVARANDE TILL EN UNIK LISTA (KORRIGERAD)
        const allPresentMembers = new Set<string>();
        for (const session of Items) {
          // En 'for...of'-loop på ett Set-objekt från DynamoDB itererar korrekt över dess värden.
          if (session.presentMembers) {
            for (const memberEmail of session.presentMembers) {
              allPresentMembers.add(memberEmail);
            }
          }
        }

        const uniqueMemberList = Array.from(allPresentMembers);

        // STEG 5: RETURNERA DEN KOMPLETTA LISTAN
        return sendResponse({ presentMembers: uniqueMemberList });

      } catch (error: any) {
        console.error("Misslyckades att hämta närvarolista:", error);
        return sendError(500, error.message || "Internal server error.");
      }
    }
  );
