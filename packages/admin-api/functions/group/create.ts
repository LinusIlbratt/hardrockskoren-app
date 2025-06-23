import middy from "@middy/core";
import { validateSchema } from "../../../core/middleware/validateSchema";
import { sendResponse, sendError } from "../../../core/utils/http";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { createGroupSchema } from "./schemas";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, CreateGroupCommand, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { marshall } from "@aws-sdk/util-dynamodb";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = middy()
  .use(validateSchema(createGroupSchema))
  .handler(
    async (
      event: APIGatewayProxyEventV2WithLambdaAuthorizer<any>
    ): Promise<APIGatewayProxyResultV2> => {
      try {
        // --- Verifiera Admin-roll (som tidigare) ---
        const userPoolId = process.env.COGNITO_USER_POOL_ID as string;
        const userId = event.requestContext.authorizer.lambda.uuid;
        const userCommand = new AdminGetUserCommand({ UserPoolId: userPoolId, Username: userId });
        const userResponse = await cognitoClient.send(userCommand);
        const roleAttribute = userResponse.UserAttributes?.find(attr => attr.Name === "custom:role");
        if (roleAttribute?.Value !== "admin") {
          return sendError(403, "Forbidden: You do not have permission to create groups.");
        }

        if (!event.body) {
          return sendError(400, "Request body is required.");
        }
        const { name, groupSlug, description } = JSON.parse(event.body);

        // --- STEG 2: Skapa gruppen i Cognito med SLUGGEN ---
        const createCognitoGroupCmd = new CreateGroupCommand({
          UserPoolId: userPoolId,
          GroupName: groupSlug, // Använd den säkra sluggen här
          Description: description,
        });
        await cognitoClient.send(createCognitoGroupCmd);

        // --- STEG 3: Skapa posten i DynamoDB med SLUGGEN som PK ---
        const groupId = nanoid();
        const putDynamoCmd = new PutItemCommand({
          TableName: process.env.MAIN_TABLE as string,
          Item: marshall({
            PK: `GROUP#${groupSlug}`, // Använd den säkra sluggen här
            SK: `METADATA`,
            id: groupId,
            name: name, // Spara det ursprungliga, snygga namnet
            slug: groupSlug, // Spara även sluggen för enkel åtkomst
            description,
            createdAt: new Date().toISOString(),
            createdBy: userId,
          }),
        });
        await dbClient.send(putDynamoCmd);

        return sendResponse({ message: "Group created successfully.", groupId }, 201);

      } catch (error: any) {
        if (error.name === 'GroupExistsException') {
          return sendError(409, "A group with this name already exists.");
        }
        if (error.name === 'InvalidParameterException') {
            return sendError(400, "Group name contains invalid characters.");
        }
        console.error("Error creating group:", error);
        return sendError(500, error.message || "Internal server error");
      }
    }
  );