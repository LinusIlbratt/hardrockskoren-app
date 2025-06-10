import middy from "@middy/core";
import { validateSchema } from "../../../core/middleware/validateSchema";
import { sendResponse, sendError } from "../../../core/utils/http";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { createGroupSchema } from "./schemas";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
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
        // 🛡️ Hämta användarens roll från Cognito
        const userPoolId = process.env.COGNITO_USER_POOL_ID as string;
        const userId = event.requestContext.authorizer.lambda.uuid;

        const userCommand = new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: userId,
        });

        const userResponse = await cognitoClient.send(userCommand);
        const roleAttribute = userResponse.UserAttributes?.find(attr => attr.Name === "custom:role");
        const role = roleAttribute?.Value || "user";

        // Kontrollera om användaren är admin
        if (role !== "admin") {
          return sendError(403, "Forbidden: You do not have permission to create groups.");
        }

        if (!event.body) {
          return sendError(400, "Request body is required.");
        }

        const { name, description } = JSON.parse(event.body);

        // Skapa ett unikt grupp-ID
        const groupId = nanoid();

        // Kontrollera om kören redan finns
        const getCommand = new GetItemCommand({
          TableName: process.env.MAIN_TABLE as string,
          Key: marshall({
            PK: `GROUP#${name}`,
            SK: `METADATA`,
          }),
        });

        const { Item: exists } = await dbClient.send(getCommand);
        if (exists) {
          return sendError(409, "Group already exists.");
        }

        // Skapa kören
        const putCommand = new PutItemCommand({
          TableName: process.env.MAIN_TABLE as string,
          Item: marshall({
            PK: `GROUP#${name}`,
            SK: `METADATA`,
            id: groupId,
            name,
            description,
            createdAt: new Date().toISOString(),
            createdBy: userId,
          }),
        });

        await dbClient.send(putCommand);

        return sendResponse({ message: "Group created.", groupId }, 201);
      } catch (error: any) {
        console.error("Error creating group:", error);
        return sendError(500, error.message || "Internal server error");
      }
    }
  );
