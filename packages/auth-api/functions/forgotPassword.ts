import middy from "@middy/core";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { sendResponse, sendError } from "../../core/utils/http";
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { validateSchema } from "../../core/middleware/validateSchema";
import { forgotPasswordSchema } from "./schemas"; 
import { Resend } from 'resend';

// --- Initialisering ---
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
// ÄNDRING: SES-klienten är borttagen.
// const sesClient = new SESv2Client({ region: process.env.AWS_REGION });
const resend = new Resend(process.env.RESEND_API_KEY);

const USER_POOL_ID = process.env.USER_POOL_ID!;
const RESET_TABLE_NAME = process.env.RESET_TABLE_NAME!;
// ÄNDRING: Använd en verifierad "From"-adress för Resend
const FROM_EMAIL = 'Hårdrockskören <noreply@hardrockskoren.se>'; 

interface RequestBody {
    email: string;
}

// Funktion för att generera en 6-siffrig kod (ingen ändring här)
const generateCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ÄNDRING: Ny e-postmall för återställningskoden
const ResetCodeEmailTemplate = ({ code }: { code: string }): string => `
  <div style="font-family: sans-serif; padding: 20px; background-color: #f4f4f4;">
    <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 40px; max-width: 600px; margin: 0 auto; text-align: center;">
      <h1 style="font-size: 24px; color: #333;">Återställning av lösenord</h1>
      <p style="font-size: 16px; color: #555; line-height: 1.5;">Använd koden nedan för att återställa ditt lösenord. Koden är giltig i 15 minuter.</p>
      <div style="background: #f0f0f0; border-radius: 5px; padding: 10px 20px; margin: 20px 0;">
        <h2 style="letter-spacing: 4px; font-size: 32px; margin: 0; color: #333;">${code}</h2>
      </div>
    </div>
  </div>
`;

// --- Lambda Handler ---
export const handler = middy<APIGatewayProxyEventV2, APIGatewayProxyResultV2>()
  .use(validateSchema(forgotPasswordSchema))
  .handler(
    async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
      if (!USER_POOL_ID || !RESET_TABLE_NAME || !process.env.RESEND_API_KEY) {
        return sendError(500, "Serverkonfigurationen är ofullständig.");
      }

      try {
        const { email } = JSON.parse(event.body || '{}') as RequestBody;

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

        const code = generateCode();
        const expiresAt = Math.floor(Date.now() / 1000) + 900; // 15 minuter

        const putCommand = new PutItemCommand({
          TableName: RESET_TABLE_NAME,
          Item: marshall({ email, code, expiresAt }),
        });
        await dbClient.send(putCommand);

        // ÄNDRING: Byt ut SES mot Resend
       const { data, error } = await resend.emails.send({
          from: FROM_EMAIL,
          to: [email],
          subject: `Din återställningskod för Hårdrockskören`,
          html: ResetCodeEmailTemplate({ code }),
        });

        // 2. Kontrollera om 'error'-objektet finns
        if (error) {
          // Om det finns ett fel, logga det och returnera ett fel
          console.error("Resend API-fel:", error);
          // Du kan fortfarande returnera ett "OK" till klienten av säkerhetsskäl
          return sendResponse({ message: "Om ett konto med den e-postadressen finns, har en återställningskod skickats." });
        }

        // 3. Om inget fel fanns (data finns), logga framgång
        console.log(`En återställningskod har skickats till ${email}. Resend ID: ${data?.id}`);
        return sendResponse({ message: "Om ett konto med den e-postadressen finns, har en återställningskod skickats." });

      } catch (error: any) {
        // Denna catch fångar nu fel från ListUsers eller DynamoDB
        console.error("Misslyckades att initiera lösenordsåterställning (Generellt fel):", error);
        return sendError(500, "Internal server error.");
      }
    }
  );
