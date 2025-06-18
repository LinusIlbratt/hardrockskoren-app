import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const sesClient = new SESv2Client({ region: process.env.AWS_REGION });

const INVITE_TABLE = process.env.INVITE_TABLE;
const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS;
const FRONTEND_URL = process.env.FRONTEND_URL; // t.ex. https://din-frontend.se

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!INVITE_TABLE || !FROM_EMAIL_ADDRESS || !FRONTEND_URL || !event.body) {
    return sendError(500, "Server configuration or request body is missing.");
  }

  try {
    // Acceptera en array av e-postadresser
    const { emails, groupName, role } = JSON.parse(event.body);
    if (!emails || !Array.isArray(emails) || emails.length === 0 || !groupName || !role) {
      return sendError(400, "An array of emails, a groupName, and a role are required.");
    }

    const ttl = Math.floor(Date.now() / 1000) + 604800; // 7 dagar

    // Skapa en array av "löften" (promises) för varje inbjudan
    const invitePromises = emails.map(async (email: string) => {
      const inviteId = nanoid(16);
      const registrationLink = `${FRONTEND_URL}/register?invite=${inviteId}`;

      const item = {
        inviteId,
        email,
        groupName,
        role,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        timeToLive: ttl,
      };

      // Skapa kommandon för databas och e-post
      const putCommand = new PutItemCommand({
        TableName: INVITE_TABLE,
        Item: marshall(item),
      });

      const emailCommand = new SendEmailCommand({
        FromEmailAddress: FROM_EMAIL_ADDRESS,
        Destination: { ToAddresses: [email] },
        Content: {
          Simple: {
            Subject: { Data: "Du är inbjuden till Hårdrockskören!" },
            Body: {
              Html: {
                Data: `<h1>Välkommen till Hårdrockskören!</h1><p>Du har blivit inbjuden att gå med i kören <strong>${groupName}</strong> med rollen ${role}.</p><p>Klicka på länken nedan för att skapa ditt konto:</p><a href="${registrationLink}">Skapa konto</a><p>Länken är giltig i 7 dagar.</p>`,
              },
            },
          },
        },
      });

      // Utför båda operationerna
      await dbClient.send(putCommand);
      await sesClient.send(emailCommand);

      return { email, inviteId };
    });

    // Kör alla "löften" samtidigt för maximal effektivitet
    const results = await Promise.all(invitePromises);

    return sendResponse({ message: `${results.length} invites sent successfully.`, invites: results }, 201);

  } catch (error: any) {
    console.error("Error creating invites:", error);
    return sendError(500, error.message);
  }
};