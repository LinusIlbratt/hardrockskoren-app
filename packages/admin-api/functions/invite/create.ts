// --- IMPORTER ---
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, ListUsersCommand, AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { nanoid } from "nanoid";
import { Resend } from 'resend';
// FÖRBÄTTRING: React-importen behövs inte längre här.

// --- E-POSTMALLAR (Nu som funktioner som returnerar HTML-strängar) ---

const PlainTextInviteTemplate = ({ choirName, invitedBy, inviteLink }: { choirName: string; invitedBy: string; inviteLink: string; }): string => {
  return `
Inbjudan till Hårdrockskören

Hej!
Du har blivit inbjuden av ${invitedBy} att gå med i kören ${choirName}.
Klicka på länken nedan för att acceptera din inbjudan och skapa ditt konto.

Acceptera här: ${inviteLink}

Länken är giltig i 7 dagar. Om du inte förväntade dig denna inbjudan kan du tryggt ignorera detta meddelande.
  `;
};

const PlainTextNotificationTemplate = ({ choirName, userName }: { choirName: string; userName: string; }): string => {
  return `
Du har lagts till i en ny kör!

Hej ${userName},
En administratör har lagt till dig i kören ${choirName}.

Nästa gång du loggar in på Hårdrockskörens portal kommer du att se den nya gruppen i din profil.
  `;
};


// Mall för en helt ny användare som får en inbjudningslänk
const InviteEmailTemplate = ({ choirName, invitedBy, inviteLink }: { choirName: string; invitedBy: string; inviteLink: string; }): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Inbjudan till Hårdrockskören</title>
  </head>
  <body>
    <div style="font-family: sans-serif; padding: 20px; background-color: #f4f4f4;">
      <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 40px; max-width: 600px; margin: 0 auto; text-align: center;">
        <h1 style="font-size: 24px; color: #333;">Inbjudan till Hårdrockskören</h1>
        <p style="font-size: 16px; color: #555; line-height: 1.5;">Hej!</p>
        <p style="font-size: 16px; color: #555; line-height: 1.5;">Du har blivit inbjuden av <strong>${invitedBy}</strong> att gå med i kören <strong>${choirName}</strong>.</p>
        <p style="font-size: 16px; color: #555; line-height: 1.5;">Klicka på knappen nedan för att acceptera din inbjudan och skapa ditt konto.</p>
        <a href="${inviteLink}" style="background-color: #a90000; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block; margin-top: 20px;">Gå med i kören</a>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">Länken är giltig i 7 dagar. Om du inte förväntade dig denna inbjudan kan du tryggt ignorera detta meddelande.</p>
      </div>
    </div>
  </body>
  </html>
`;

// Mall för en befintlig användare som bara läggs till i en ny grupp
// UPPDATERA DENNA MALL
const NotificationEmailTemplate = ({ choirName, userName }: { choirName: string; userName: string; }): string => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Du har lagts till i en ny kör!</title>
  </head>
  <body>
    <div style="font-family: sans-serif; padding: 20px; background-color: #f4f4f4;">
      <div style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 40px; max-width: 600px; margin: 0 auto; text-align: center;">
        <h1 style="font-size: 24px; color: #333;">Du har lagts till i en ny kör!</h1>
        <p style="font-size: 16px; color: #555; line-height: 1.5;">Hej ${userName},</p>
        <p style="font-size: 16px; color: #555; line-height: 1.5;">En administratör har lagt till dig i kören <strong>${choirName}</strong>.</p>
        <p style="font-size: 16px; color: #555; line-height: 1.5;">Nästa gång du loggar in på Hårdrockskörens portal kommer du att se den nya gruppen i din profil.</p>
      </div>
    </div>
  </body>
  </html>
`;


// --- KLIENTER & KONSTANTER ---
const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const INVITE_TABLE = process.env.INVITE_TABLE!;
const MAIN_TABLE = process.env.MAIN_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const FRONTEND_URL = process.env.FRONTEND_URL!;
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'Hårdrockskören <inbjudan@hardrockskoren.se>';


export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!INVITE_TABLE || !MAIN_TABLE || !USER_POOL_ID || !FRONTEND_URL || !event.body) {
    return sendError(500, "Server configuration is missing.");
  }

  try {
    const { emails, groupSlug, role } = JSON.parse(event.body);
    if (!emails || !Array.isArray(emails) || emails.length === 0 || !groupSlug || !role) {
      return sendError(400, "An array of emails, a groupSlug, and a role are required.");
    }

    const getGroupCommand = new GetItemCommand({
      TableName: MAIN_TABLE,
      Key: { PK: { S: `GROUP#${groupSlug}` }, SK: { S: 'METADATA' } }
    });
    const { Item: groupItem } = await dbClient.send(getGroupCommand);
    if (!groupItem) {
      return sendError(404, `Group with slug '${groupSlug}' not found.`);
    }
    const groupDetails = unmarshall(groupItem);

    const results = await Promise.allSettled(emails.map(async (email: string) => {
      const listUsersCmd = new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Filter: `email = "${email}"`,
        Limit: 1,
      });
      const { Users } = await cognitoClient.send(listUsersCmd);

      // --- FALL 1: Användaren FINNS REDAN ---
      if (Users && Users.length > 0) {
        const existingUser = Users[0];
        const username = existingUser.Username!;
        const userAttributes = existingUser.Attributes!;
        const givenName = userAttributes.find(a => a.Name === 'given_name')?.Value || 'medlem';

        await cognitoClient.send(new AdminAddUserToGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          GroupName: groupSlug,
        }));

        const userGroupLink = {
          PK: `GROUP#${groupSlug}`, SK: `USER#${email}`, email: email,
          given_name: givenName,
          family_name: userAttributes.find(a => a.Name === 'family_name')?.Value || '',
          role: userAttributes.find(a => a.Name === 'custom:role')?.Value || 'user',
          createdAt: new Date().toISOString(),
        };
        await dbClient.send(new PutItemCommand({ TableName: MAIN_TABLE, Item: marshall(userGroupLink) }));

        // ÄNDRING: Använder 'html' istället för 'react'
        // I "FALL 1: Användaren FINNS REDAN"
        await resend.emails.send({
          from: FROM_EMAIL,
          to: [email], // Använd en ny test-adress
          subject: `Du har lagts till i kören: ${groupDetails.name}!`,
          // UPPDATERA TILL DETTA:
          html: NotificationEmailTemplate({
            choirName: groupDetails.name,
            userName: givenName,
          }),
          text: PlainTextNotificationTemplate({ // <-- LÄGG TILL DENNA RAD
            choirName: groupDetails.name,
            userName: givenName,
          }),
        });

        return { email, status: 'ADDED_DIRECTLY' };
      }
      // --- FALL 2: Användaren FINNS INTE ---
      else {
        const inviteId = nanoid(16);
        const registrationLink = `${FRONTEND_URL}/register?invite=${inviteId}`;
        const ttl = Math.floor(Date.now() / 1000) + 604800; // 7 dagar

        const itemToSave = { inviteId, email, groupSlug, groupDisplayName: groupDetails.name, role, status: 'PENDING', createdAt: new Date().toISOString(), timeToLive: ttl };
        await dbClient.send(new PutItemCommand({ TableName: INVITE_TABLE, Item: marshall(itemToSave) }));

        // ÄNDRING: Använder 'html' istället för 'react'
        // I "FALL 2: Användaren FINNS INTE"
        await resend.emails.send({
          from: FROM_EMAIL,
          to: [email], // Byt till en ny test-adress
          subject: `Inbjudan till kören ${groupDetails.name}!`,

          // Både HTML och ren text inkluderas
          html: InviteEmailTemplate({
            choirName: groupDetails.name,
            invitedBy: "En administratör",
            inviteLink: registrationLink,
          }),
          text: PlainTextInviteTemplate({
            choirName: groupDetails.name,
            invitedBy: "En administratör",
            inviteLink: registrationLink,
          })
        });

        return { email, status: 'INVITE_SENT' };
      }
    }));

    return sendResponse({ message: "Invite process completed.", results }, 200);

  } catch (error: any) {
    console.error("Error creating invites:", error);
    return sendError(500, error.message);
  }
};
