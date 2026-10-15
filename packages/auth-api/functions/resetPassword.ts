import middy from "@middy/core";
import { DynamoDBClient, GetItemCommand, DeleteItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
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
const MAX_RESET_ATTEMPTS = 5;
const INVALID_RESET_MESSAGE = "Ogiltig eller utgången återställningskod";

function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof Error && error.name === "ConditionalCheckFailedException";
}

/** Fel kod räknas upp på just den sparade koden. `null` om posten hunnit bytas ut. */
async function registerFailedAttempt(email: string, storedCode: string): Promise<number | null> {
  try {
    const updated = await dbClient.send(
      new UpdateItemCommand({
        TableName: RESET_TABLE_NAME,
        Key: { email: { S: email } },
        UpdateExpression: "ADD attempts :one",
        ConditionExpression: "attribute_exists(email) AND #code = :storedCode",
        ExpressionAttributeNames: { "#code": "code" },
        ExpressionAttributeValues: {
          ":one": { N: "1" },
          ":storedCode": { S: storedCode },
        },
        ReturnValues: "UPDATED_NEW",
      })
    );
    const raw = updated.Attributes?.attempts?.N;
    const attempts = raw === undefined ? 0 : Number(raw);
    if (Number.isFinite(attempts) && attempts >= MAX_RESET_ATTEMPTS) {
      await deleteResetCode(email, storedCode);
    }
    return Number.isFinite(attempts) ? attempts : 0;
  } catch (error: unknown) {
    if (isConditionalCheckFailed(error)) {
      return null;
    }
    throw error;
  }
}

async function deleteResetCode(email: string, storedCode: string): Promise<void> {
  try {
    await dbClient.send(
      new DeleteItemCommand({
        TableName: RESET_TABLE_NAME,
        Key: { email: { S: email } },
        ConditionExpression: "attribute_exists(email) AND #code = :storedCode",
        ExpressionAttributeNames: { "#code": "code" },
        ExpressionAttributeValues: { ":storedCode": { S: storedCode } },
      })
    );
  } catch (error: unknown) {
    if (isConditionalCheckFailed(error)) {
      return;
    }
    throw error;
  }
}

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
          return sendError(400, INVALID_RESET_MESSAGE);
        }

        const tokenData = unmarshall(Item);
        const storedCode = typeof tokenData.code === "string" ? tokenData.code : "";
        const attempts = typeof tokenData.attempts === "number" ? tokenData.attempts : 0;

        if (!storedCode || attempts >= MAX_RESET_ATTEMPTS) {
          if (storedCode) {
            await deleteResetCode(email, storedCode);
          }
          return sendError(400, INVALID_RESET_MESSAGE);
        }

        if (tokenData.code !== code) {
          await registerFailedAttempt(email, storedCode);
          return sendError(400, INVALID_RESET_MESSAGE);
        }
        if (tokenData.expiresAt < Math.floor(Date.now() / 1000)) {
          return sendError(400, INVALID_RESET_MESSAGE);
        }

        // STEG 3: Återställ lösenordet i Cognito
        const setUserPasswordCmd = new AdminSetUserPasswordCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          Password: newPassword,
          Permanent: true, // Sätt lösenordet som permanent
        });
        await cognitoClient.send(setUserPasswordCmd);

        // STEG 4: Förbruka koden. Villkoret träffar bara den kod som just användes.
        await deleteResetCode(email, storedCode);

        console.log(`Lösenordet för ${email} har återställts.`);
        return sendResponse({ message: "Ditt lösenord har nu återställts. Du kan nu logga in med ditt nya lösenord." });

      } catch (error: unknown) {
        const name = error instanceof Error ? error.name : "";
        if (name === "InvalidPasswordException" || name === "InvalidParameterException") {
          console.error("Misslyckades att återställa lösenord: lösenordet uppfyller inte policyn", error);
          return sendError(
            400,
            "Lösenordet uppfyller inte säkerhetskraven (minst 8 tecken, en stor och en liten bokstav samt en siffra)."
          );
        }

        console.error("Misslyckades att återställa lösenord:", error);
        return sendError(500, "Ett oväntat fel uppstod.");
      }
    }
  );
