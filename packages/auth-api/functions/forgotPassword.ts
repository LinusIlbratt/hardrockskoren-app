import middy from "@middy/core";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { marshall } from "@aws-sdk/util-dynamodb";
import { sendResponse, sendError } from "../../core/utils/http";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { validateSchema } from "../../core/middleware/validateSchema";
import { forgotPasswordSchema } from "./schemas"; 

// --- Initialisering ---
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const sesClient = new SESv2Client({ region: process.env.AWS_REGION });

const USER_POOL_ID = process.env.USER_POOL_ID!;
const RESET_TABLE_NAME = process.env.RESET_TABLE_NAME!;
const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS!;

interface RequestBody {
    email: string;
}

// Funktion för att generera en 6-siffrig kod
const generateCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// --- Lambda Handler ---
export const handler = middy<APIGatewayProxyEventV2, APIGatewayProxyResultV2>()
  .use(validateSchema(forgotPasswordSchema))
  .handler(
    async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
      if (!USER_POOL_ID || !RESET_TABLE_NAME || !FROM_EMAIL_ADDRESS) {
        return sendError(500, "Serverkonfigurationen är ofullständig.");
      }

      try {
        const { email } = JSON.parse(event.body || '{}') as RequestBody;

        // STEG 1: Kontrollera att användaren faktiskt finns i Cognito
        const listUsersCmd = new ListUsersCommand({
          UserPoolId: USER_POOL_ID,
          Filter: `email = "${email}"`,
          Limit: 1,
        });
        const { Users } = await cognitoClient.send(listUsersCmd);

        if (!Users || Users.length === 0) {
          console.log(`Försök att återställa lösenord för en obefintlig användare: ${email}`);
          return sendResponse({ message: "Om ett konto med den e-postadressen finns, har en återställningskod skickats." });
        }

        // STEG 2: Generera kod och spara den i vår nya tabell
        const code = generateCode();
        const expiresAt = Math.floor(Date.now() / 1000) + 900; // Giltig i 15 minuter

        const putCommand = new PutItemCommand({
          TableName: RESET_TABLE_NAME,
          Item: marshall({ email, code, expiresAt }),
        });
        await dbClient.send(putCommand);

        // STEG 3: Skicka e-post med koden via SES
        const sendEmailCommand = new SendEmailCommand({
          FromEmailAddress: FROM_EMAIL_ADDRESS,
          Destination: { ToAddresses: [email] },
          Content: {
            Simple: {
              Subject: { Data: `Din återställningskod för Hårdrockskören` },
              Body: {
                Html: { Data: `<h1>Återställning av lösenord</h1><p>Använd koden nedan för att återställa ditt lösenord. Koden är giltig i 15 minuter.</p><h2 style="letter-spacing: 2px;">${code}</h2>` },
              },
            },
          },
        });
        await sesClient.send(sendEmailCommand);

        console.log(`En återställningskod har skickats till ${email}`);
        return sendResponse({ message: "Om ett konto med den e-postadressen finns, har en återställningskod skickats." });

      } catch (error: any) {
        console.error("Misslyckades att initiera lösenordsåterställning:", error);
        return sendError(500, "Internal server error.");
      }
    }
  );
