// Importera även GetItemCommand och unmarshall
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb"; // Importera unmarshall
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const sesClient = new SESv2Client({ region: process.env.AWS_REGION });

const INVITE_TABLE = process.env.INVITE_TABLE;
const MAIN_TABLE = process.env.MAIN_TABLE; // Lägg till din huvud-tabell i environment variables
const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS;
const FRONTEND_URL = process.env.FRONTEND_URL;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!INVITE_TABLE || !MAIN_TABLE || !FROM_EMAIL_ADDRESS || !FRONTEND_URL || !event.body) {
    return sendError(500, "Server configuration or request body is missing.");
  }

  try {
    // 1. DÖP VARIABEL FÖR TYDLIGHET
    const { emails, groupSlug, role } = JSON.parse(event.body);
    if (!emails || !Array.isArray(emails) || emails.length === 0 || !groupSlug || !role) {
      return sendError(400, "An array of emails, a groupSlug, and a role are required.");
    }

    // 2. HÄMTA DEN FULLSTÄNDIGA GRUPPINFORMATIONEN FRÅN HUVUD-TABELL
    const getGroupCommand = new GetItemCommand({
        TableName: MAIN_TABLE,
        Key: {
            PK: { S: `GROUP#${groupSlug}` },
            SK: { S: 'METADATA' }
        }
    });
    const { Item: groupItem } = await dbClient.send(getGroupCommand);

    // 3. HANTERA FALLET DÄR GRUPPEN INTE FINNS
    if (!groupItem) {
        return sendError(404, `Group with slug '${groupSlug}' not found.`);
    }
    const groupDetails = unmarshall(groupItem); // Nu har vi { id, name, slug, description, ... }

    const ttl = Math.floor(Date.now() / 1000) + 604800; // 7 dagar

    const invitePromises = emails.map(async (email: string) => {
      const inviteId = nanoid(16);
      const registrationLink = `${FRONTEND_URL}/register?invite=${inviteId}`;

      // 5. SPARA BÅDE SLUG OCH DET SNYGGA NAMNET I INBJUDAN
      const itemToSave = {
        inviteId,
        email,
        groupSlug: groupSlug,                   
        groupDisplayName: groupDetails.name,
        role,
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        timeToLive: ttl,
      };
      
      const putCommand = new PutItemCommand({
        TableName: INVITE_TABLE,
        Item: marshall(itemToSave),
      });

      // 4. ANVÄND DET KORREKTA, SNYGGA NAMNET I E-POSTMEDDELANDET
      const emailCommand = new SendEmailCommand({
        FromEmailAddress: FROM_EMAIL_ADDRESS,
        Destination: { ToAddresses: [email] },
        Content: {
          Simple: {
            Subject: { Data: "Du är inbjuden till Hårdrockskören!" },
            Body: {
              Html: {
                Data: `<h1>Välkommen till Hårdrockskören!</h1><p>Du har blivit inbjuden att gå med i kören <strong>${groupDetails.name}</strong> med rollen ${role}.</p><p>Klicka på länken nedan för att skapa ditt konto:</p><a href="${registrationLink}">Skapa konto</a><p>Länken är giltig i 7 dagar.</p>`,
              },
            },
          },
        },
      });

      await dbClient.send(putCommand);
      await sesClient.send(emailCommand);

      return { email, inviteId };
    });

    const results = await Promise.all(invitePromises);
    return sendResponse({ message: `${results.length} invites sent successfully.`, invites: results }, 201);

  } catch (error: any) {
    console.error("Error creating invites:", error);
    return sendError(500, error.message);
  }
};