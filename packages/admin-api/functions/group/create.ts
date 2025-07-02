import middy from "@middy/core";
import { validateSchema } from "../../../core/middleware/validateSchema";
import { sendResponse, sendError } from "../../../core/utils/http";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { createGroupSchema } from "./schemas";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, CreateGroupCommand, DeleteGroupCommand } from "@aws-sdk/client-cognito-identity-provider";
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
      const userPoolId = process.env.COGNITO_USER_POOL_ID as string;
      const { groupSlug, name, choirLeader } = JSON.parse(event.body);

      try {
        // --- FÖRBÄTTRING 1: Effektivare behörighetskontroll ---
        const invokerRole = event.requestContext.authorizer.lambda.role;
        if (invokerRole !== "admin") {
          return sendError(403, "Forbidden: You do not have permission to create groups.");
        }

        // --- Skapa gruppen i Cognito ---
        const createCognitoGroupCmd = new CreateGroupCommand({
          UserPoolId: userPoolId,
          GroupName: groupSlug,
        });
        await cognitoClient.send(createCognitoGroupCmd);

        // --- Skapa posten i DynamoDB ---
        const groupId = nanoid();
        const putDynamoCmd = new PutItemCommand({
          TableName: process.env.MAIN_TABLE as string,
          Item: marshall({
            PK: `GROUP#${groupSlug}`,
            SK: `METADATA`,
            id: groupId,
            name: name,
            slug: groupSlug,
            choirLeader: choirLeader,
            createdAt: new Date().toISOString(),
            createdBy: event.requestContext.authorizer.lambda.uuid,
          }),
        });
        
        // --- FÖRBÄTTRING 2: Manuell rollback vid fel ---
        try {
            await dbClient.send(putDynamoCmd);
        } catch (dbError) {
            console.error("DynamoDB write failed, rolling back Cognito group.", dbError);
            const deleteCognitoGroupCmd = new DeleteGroupCommand({ UserPoolId: userPoolId, GroupName: groupSlug });
            await cognitoClient.send(deleteCognitoGroupCmd);
            throw dbError; // Kasta ursprungliga felet vidare
        }

        return sendResponse({ message: "Group created successfully.", groupId }, 201);

      } catch (error: any) {
        // Din existerande, bra felhantering
        if (error.name === 'GroupExistsException') {
          return sendError(409, "A group with this name already exists in Cognito.");
        }
        if (error.name === 'InvalidParameterException') {
            return sendError(400, "Group name contains invalid characters.");
        }
        console.error("Error creating group:", error);
        return sendError(500, error.message || "Internal server error");
      }
    }
  );