// admin-api/attendance/attendanceRegister.ts

import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { sendResponse, sendError } from "../../../core/utils/http";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../../core/types";
import { cognito } from "../../../core/services/cognito";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

interface RequestBody {
    attendanceCode: string;
}

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.ATTENDANCE_TABLE_NAME;
const indexName = "AttendanceCodeIndex";

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>()
  .handler(
    async (event: AuthorizedEvent): Promise<APIGatewayProxyResultV2> => {
      if (!tableName) {
        console.error("Miljövariabeln ATTENDANCE_TABLE_NAME är inte satt.");
        return sendError(500, "Serverkonfigurationen är ofullständig.");
      }

      try {
        const { attendanceCode } = JSON.parse(event.body || '{}') as RequestBody;
        const userContext = event.requestContext.authorizer.lambda;
        const groupSlug = event.pathParameters?.groupSlug;

        if (!groupSlug) {
            return sendError(400, "Grupp-ID saknas i URL:en.");
        }
        if (!attendanceCode) {
            return sendError(400, "Närvarokod saknas i anropet.");
        }
        if (!userContext.uuid || !userContext.userPoolId) {
            return sendError(400, "Användarinformation (uuid, userPoolId) saknas från authorizer.");
        }

        // STEG 1: HÄMTA ATTRIBUT FRÅN COGNITO
        const { UserAttributes } = await cognito.adminGetUser({
            UserPoolId: userContext.userPoolId,
            Username: userContext.uuid,
        });
        const attributes = UserAttributes || [];
        const givenName = attributes.find(attr => attr.Name === 'given_name')?.Value;
        const familyName = attributes.find(attr => attr.Name === 'family_name')?.Value;
        const userEmail = attributes.find(attr => attr.Name === 'email')?.Value;

        if (!userEmail) {
            return sendError(404, "Kunde inte hitta användarens e-post i Cognito.");
        }

        // Skapa ett objekt som ska sparas
        const memberObject = {
          givenName: givenName || '',
          familyName: familyName || userEmail,
        };

        // STEG 2: HITTA SESSIONEN VIA KODEN
        const queryCommand = new QueryCommand({
            TableName: tableName,
            IndexName: indexName,
            KeyConditionExpression: "attendanceCode = :code",
            ExpressionAttributeValues: { ":code": attendanceCode },
        });

        const { Items } = await docClient.send(queryCommand);
        if (!Items || Items.length === 0) {
            return sendError(404, "Ogiltig närvarokod.");
        }

        const session = Items[0];
        const now = Math.floor(Date.now() / 1000);

        // STEG 3: VALIDERA ATT KODEN INTE HAR GÅTT UT
        if (session.expiresAt < now) {
            return sendError(410, "Koden har gått ut och är inte längre giltig.");
        }
        
        // STEG 4: LÄGG TILL ANVÄNDAROBJEKTET I NÄRVAROLISTAN
        const updateCommand = new UpdateCommand({
            TableName: tableName,
            Key: {
                date: session.date,
                sessionId: session.sessionId,
            },
            UpdateExpression: "SET presentMembers = list_append(if_not_exists(presentMembers, :empty_list), :new_member)",
            ExpressionAttributeValues: {
                ":new_member": [memberObject],
                ":empty_list": [],
            },
            ReturnValues: "NONE",
        });

        await docClient.send(updateCommand);
        console.log(`Användare ${memberObject.givenName} ${memberObject.familyName} anmälde närvaro för session ${session.sessionId}`);

        // STEG 5: RETURNERA SUCCÉ-SVAR
        return sendResponse({ message: "Närvaro registrerad!" });

      } catch (error: any) {
        console.error("Misslyckades att registrera närvaro:", error);
        return sendError(500, error.message || "Internal server error.");
      }
    }
  );