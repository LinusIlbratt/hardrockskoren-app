import middy from "@middy/core";
import { sendResponse, sendError } from "../../../core/utils/http";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { DynamoDBClient, QueryCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = middy().handler(
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
        return sendError(403, "Forbidden: You do not have permission to delete groups.");
      }

      // Kontrollera att groupName är inkluderat
      const groupName = event.pathParameters?.name;
      if (!groupName) {
        return sendError(400, "Group name is required.");
      }

      // Hämta alla poster som tillhör gruppen
      const queryCommand = new QueryCommand({
        TableName: process.env.MAIN_TABLE as string,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": { S: `GROUP#${groupName}` },
        },
      });

      const queryResponse = await dbClient.send(queryCommand);
      const items = queryResponse.Items || [];

      if (items.length === 0) {
        return sendError(404, "Group not found.");
      }

      // Ta bort alla poster relaterade till gruppen
      for (const item of items) {
        const unmarshalledItem = unmarshall(item);
        const deleteCommand = new DeleteItemCommand({
          TableName: process.env.MAIN_TABLE as string,
          Key: marshall({
            PK: `GROUP#${groupName}`,
            SK: unmarshalledItem.SK,
          }),
        });

        await dbClient.send(deleteCommand);
      }

      return sendResponse({ message: "Group deleted successfully." }, 200);
    } catch (error: any) {
      console.error("Error deleting group:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);
