// --- NYTT: Importera allt vi behöver från AWS SDK ---
import { DynamoDBClient, PutItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, ListUsersCommand, AdminAddUserToGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import { nanoid } from "nanoid";

// --- NYTT: Lägg till Cognito-klient ---
const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const sesClient = new SESv2Client({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

// --- NYTT: Lägg till USER_POOL_ID ---
const INVITE_TABLE = process.env.INVITE_TABLE!;
const MAIN_TABLE = process.env.MAIN_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;
const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS!;
const FRONTEND_URL = process.env.FRONTEND_URL!;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  // --- NYTT: Lade till USER_POOL_ID i valideringen ---
  if (!INVITE_TABLE || !MAIN_TABLE || !USER_POOL_ID || !FROM_EMAIL_ADDRESS || !FRONTEND_URL || !event.body) {
    return sendError(500, "Server configuration is missing.");
  }

  try {
    const { emails, groupSlug, role } = JSON.parse(event.body);
    if (!emails || !Array.isArray(emails) || emails.length === 0 || !groupSlug || !role) {
      return sendError(400, "An array of emails, a groupSlug, and a role are required.");
    }

    // Detta steg är detsamma: hämta gruppens namn för e-post.
    const getGroupCommand = new GetItemCommand({
        TableName: MAIN_TABLE,
        Key: { PK: { S: `GROUP#${groupSlug}` }, SK: { S: 'METADATA' } }
    });
    const { Item: groupItem } = await dbClient.send(getGroupCommand);
    if (!groupItem) {
        return sendError(404, `Group with slug '${groupSlug}' not found.`);
    }
    const groupDetails = unmarshall(groupItem);

    // --- NYTT: Hela logiken inuti map() är nu uppdaterad ---
    const results = await Promise.allSettled(emails.map(async (email: string) => {
      
      // STEG 1: Kontrollera om användaren redan finns i Cognito
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

        // Lägg till användaren direkt i Cognito-gruppen
        await cognitoClient.send(new AdminAddUserToGroupCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            GroupName: groupSlug,
        }));
        
        // Skapa associationsposten i DynamoDB för konsistens
        const userAttributes = existingUser.Attributes!;
        const userGroupLink = {
            PK: `GROUP#${groupSlug}`, SK: `USER#${email}`, email: email,
            given_name: userAttributes.find(a => a.Name === 'given_name')?.Value || '',
            family_name: userAttributes.find(a => a.Name === 'family_name')?.Value || '',
            role: userAttributes.find(a => a.Name === 'custom:role')?.Value || 'user',
            createdAt: new Date().toISOString(),
        };
        await dbClient.send(new PutItemCommand({ TableName: MAIN_TABLE, Item: marshall(userGroupLink)}));

        // Skicka ett notifieringsmejl istället för en inbjudan
        await sesClient.send(new SendEmailCommand({
            FromEmailAddress: FROM_EMAIL_ADDRESS,
            Destination: { ToAddresses: [email] },
            Content: { Simple: {
                Subject: { Data: `Du har lagts till i kören: ${groupDetails.name}!` },
                Body: { Html: { Data: `<h1>Hej!</h1><p>En administratör har lagt till dig i kören <strong>${groupDetails.name}</strong>. Nästa gång du loggar in kommer du att se den nya gruppen i din profil.</p>` } }
            }}
        }));
        
        return { email, status: 'ADDED_DIRECTLY' };
      } 
      // --- FALL 2: Användaren FINNS INTE ---
      else {
        // Detta är din gamla, befintliga logik.
        const inviteId = nanoid(16);
        const registrationLink = `${FRONTEND_URL}/register?invite=${inviteId}`;
        const ttl = Math.floor(Date.now() / 1000) + 604800;

        const itemToSave = { inviteId, email, groupSlug, groupDisplayName: groupDetails.name, role, status: 'PENDING', createdAt: new Date().toISOString(), timeToLive: ttl };
        await dbClient.send(new PutItemCommand({ TableName: INVITE_TABLE, Item: marshall(itemToSave) }));

        await sesClient.send(new SendEmailCommand({
            FromEmailAddress: FROM_EMAIL_ADDRESS,
            Destination: { ToAddresses: [email] },
            Content: { Simple: {
                Subject: { Data: `Inbjudan till kören ${groupDetails.name}!` },
                Body: { Html: { Data: `<h1>Välkommen!</h1><p>Du har blivit inbjuden att gå med i kören <strong>${groupDetails.name}</strong> med rollen ${role}.</p><p>Klicka på länken nedan för att skapa ditt konto:</p><a href="${registrationLink}">Skapa konto</a><p>Länken är giltig i 7 dagar.</p>` } }
            }}
        }));

        return { email, status: 'INVITE_SENT' };
      }
    }));

    // --- NYTT: Uppdaterad respons till frontend ---
    return sendResponse({ message: "Invite process completed.", results }, 200);

  } catch (error: any) {
    console.error("Error creating invites:", error);
    return sendError(500, error.message);
  }
};