// admin-api/attendance/attendanceStart.ts

import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { sendResponse, sendError } from "../../../core/utils/http";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../../core/types/auth";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.ATTENDANCE_TABLE_NAME;
const indexName = "GroupDateIndex";

const generateCode = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>()
  .handler(
    async (event: AuthorizedEvent): Promise<APIGatewayProxyResultV2> => {
      if (!tableName) {
        console.error("Miljövariabeln ATTENDANCE_TABLE_NAME är inte satt.");
        return sendError(500, "Serverkonfigurationen är ofullständig.");
      }
      
      try {
        // STEG 1: AUKTORISERING & DATAHÄMTNING
        const invokerRole = event.requestContext.authorizer.lambda.role;
        if (invokerRole !== "admin" && invokerRole !== "leader") {
          return sendError(403, "Forbidden: You do not have permission to start an attendance session.");
        }

        const groupSlug = event.pathParameters?.groupSlug;
        if (!groupSlug) {
          return sendError(400, "Grupp-ID saknas i URL:en.");
        }
        
        const today = new Date().toLocaleDateString('sv-SE');
        const now = Math.floor(Date.now() / 1000);

        // STEG 2: KONTROLLERA OM EN AKTIV SESSION REDAN FINNS
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
          console.log(`Hittade en aktiv session (${activeSession.sessionId}) för grupp ${groupSlug}. Returnerar befintlig kod.`);
          return sendResponse({ 
            attendanceCode: activeSession.attendanceCode,
            expiresAt: activeSession.expiresAt 
          }, 200);
        }

        // STEG 3: OM INGEN AKTIV SESSION FINNS, SKAPA EN NY
        console.log(`Ingen aktiv session hittades för grupp ${groupSlug}. Skapar en ny...`);
        const attendanceCode = generateCode();
        const sessionId = uuidv4();
        const expiresAt = now + 1200; // 20 minuter från nu

        const sessionItem = { date: today, sessionId, attendanceCode, expiresAt, groupSlug };
        const putCommand = new PutCommand({ TableName: tableName, Item: sessionItem });
        await docClient.send(putCommand);
        
        console.log(`Skapade session med kod ${attendanceCode}`);
        return sendResponse({ 
          attendanceCode: attendanceCode,
          expiresAt: expiresAt 
        }, 201);

      } catch (error: any) {
        console.error("Misslyckades att starta närvarosession:", error);
        return sendError(500, error.message || "Internal server error. Could not start the session.");
      }
    }
  );
