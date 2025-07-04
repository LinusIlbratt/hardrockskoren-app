import middy from "@middy/core";
import { DynamoDBClient, GetItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { CognitoIdentityProviderClient, AdminSetUserPasswordCommand } from "@aws-sdk/client-cognito-identity-provider";
import { sendResponse, sendError } from "../../core/utils/http";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { validateSchema } from "../../core/middleware/validateSchema";
import { resetPasswordSchema } from "./schemas";

// --- Initialisering ---
const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const USER_POOL_ID = process.env.USER_POOL_ID!;
const RESET_TABLE_NAME = process.env.RESET_TABLE_NAME!;

interface RequestBody {
    email: string;
    code: string;
    newPassword: string;
}

// --- Lambda Handler ---
export const handler = middy<APIGatewayProxyEventV2, APIGatewayProxyResultV2>()
  .use(validateSchema(resetPasswordSchema))
  .handler(
    async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
      if (!USER_POOL_ID || !RESET_TABLE_NAME) {
        return sendError(500, "Serverkonfigurationen är ofullständig.");
      }

      try {
        const { email, code, newPassword } = JSON.parse(event.body || '{}') as RequestBody;

        // STEG 1: Hämta token från vår nya tabell
        const getItemCmd = new GetItemCommand({
          TableName: RESET_TABLE_NAME,
          Key: { email: { S: email } },
        });
        const { Item } = await dbClient.send(getItemCmd);

        if (!Item) {
          return sendError(400, "Ogiltig e-postadress eller kod.");
        }

        const tokenData = unmarshall(Item);

        // STEG 2: Verifiera koden och giltighetstiden
        if (tokenData.code !== code) {
          return sendError(400, "Felaktig kod.");
        }
        if (tokenData.expiresAt < Math.floor(Date.now() / 1000)) {
          return sendError(400, "Koden har gått ut. Vänligen begär en ny.");
        }

        // STEG 3: Återställ lösenordet i Cognito
        const setUserPasswordCmd = new AdminSetUserPasswordCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          Password: newPassword,
          Permanent: true, // Sätt lösenordet som permanent
        });
        await cognitoClient.send(setUserPasswordCmd);

        // STEG 4: Ta bort den använda koden från databasen
        const deleteItemCmd = new DeleteItemCommand({
            TableName: RESET_TABLE_NAME,
            Key: { email: { S: email } },
        });
        await dbClient.send(deleteItemCmd);

        console.log(`Lösenordet för ${email} har återställts.`);
        return sendResponse({ message: "Ditt lösenord har nu återställts. Du kan nu logga in med ditt nya lösenord." });

      } catch (error: any) {
        console.error("Misslyckades att återställa lösenord:", error);
        return sendError(500, "Ett oväntat fel uppstod.");
      }
    }
  );
