import middy from "@middy/core";
import { sendResponse, sendError } from "../../../core/utils/http";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient, QueryCommand, BatchWriteItemCommand, WriteRequest } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, DeleteGroupCommand, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = middy().handler(
  async (
    event: APIGatewayProxyEventV2WithLambdaAuthorizer<any>
  ): Promise<APIGatewayProxyResultV2> => {
    try {
      // --- Verifiera Admin-roll ---
      const userPoolId = process.env.COGNITO_USER_POOL_ID as string;
      const userId = event.requestContext.authorizer.lambda.uuid;
      const userCommand = new AdminGetUserCommand({ UserPoolId: userPoolId, Username: userId });
      const userResponse = await cognitoClient.send(userCommand);
      const roleAttribute = userResponse.UserAttributes?.find(attr => attr.Name === "custom:role");
      if (roleAttribute?.Value !== "admin") {
        return sendError(403, "Forbidden: You do not have permission to delete groups.");
      }

      // 'name' här är egentligen groupSlug från URL:en
      const groupSlug = event.pathParameters?.name;
      if (!groupSlug) {
        return sendError(400, "Group name (slug) is required.");
      }

      // --- STEG 1: Radera gruppen från Cognito ---
      const deleteCognitoGroupCmd = new DeleteGroupCommand({
        UserPoolId: userPoolId,
        GroupName: groupSlug,
      });
      await cognitoClient.send(deleteCognitoGroupCmd);

      // --- STEG 2: Radera alla poster för gruppen från DynamoDB ---
      const queryCommand = new QueryCommand({
        TableName: process.env.MAIN_TABLE as string,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `GROUP#${groupSlug}` } },
        ProjectionExpression: "PK, SK",
      });
      const queryResponse = await dbClient.send(queryCommand);
      
      if (queryResponse.Items && queryResponse.Items.length > 0) {
        const deleteRequests: WriteRequest[] = queryResponse.Items.map(item => ({
          DeleteRequest: { Key: { PK: item.PK, SK: item.SK } },
        }));

        const batchWriteCommand = new BatchWriteItemCommand({
          RequestItems: { [process.env.MAIN_TABLE as string]: deleteRequests },
        });
        await dbClient.send(batchWriteCommand);
      }

      return sendResponse({ message: "Group deleted successfully from both Cognito and DynamoDB." }, 200);

    } catch (error: any) {
      if (error.name === 'ResourceNotFoundException') {
        return sendError(404, "Group not found in Cognito.");
      }
      console.error("Error deleting group:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);