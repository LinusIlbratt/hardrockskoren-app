import middy from "@middy/core";
import { sendResponse, sendError } from "../../../core/utils/http";
// Importera din AuthContext-typ för att få typsäkerhet
import { AuthContext } from "../../../core/types"; 
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import {
  DynamoDBClient,
  QueryCommand,
  BatchWriteItemCommand,
  WriteRequest,
  AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient, DeleteGroupCommand } from "@aws-sdk/client-cognito-identity-provider";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const BATCH_WRITE_SIZE = 25;
const MAX_BATCH_RETRIES = 5;
const MAX_QUERY_PAGES = 200;

type ItemKey = { PK: AttributeValue; SK: AttributeValue };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const handler = middy().handler(
  // Använd din AuthContext-typ för att få IntelliSense på event.requestContext.authorizer.lambda
  async (
    event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
  ): Promise<APIGatewayProxyResultV2> => {
    try {
      
      const userPoolId = process.env.COGNITO_USER_POOL_ID as string;

      // 'name' här är egentligen groupSlug från URL:en
      const groupSlug = event.pathParameters?.name;
      if (!groupSlug) {
        return sendError(400, "Group name (slug) is required.");
      }

      // --- STEG 1: Radera gruppen från Cognito (om den finns) ---
      try {
        const deleteCognitoGroupCmd = new DeleteGroupCommand({
          UserPoolId: userPoolId,
          GroupName: groupSlug,
        });
        await cognitoClient.send(deleteCognitoGroupCmd);
      } catch (cognitoError: any) {
        // Om gruppen inte finns i Cognito (t.ex. inkonsistent state) – fortsätt ändå och rensa DynamoDB
        if (cognitoError.name === "ResourceNotFoundException") {
          console.warn(`Group "${groupSlug}" not found in Cognito, cleaning up DynamoDB only.`);
        } else {
          throw cognitoError;
        }
      }

      // --- STEG 2: Radera alla poster för gruppen från DynamoDB ---
      const tableName = process.env.MAIN_TABLE as string;
      const keys = await queryAllGroupKeys(tableName, groupSlug);
      await batchDeleteKeys(tableName, keys);

      return sendResponse({ message: "Group deleted successfully." }, 200);

    } catch (error: any) {
      console.error("Error deleting group:", error);
      return sendError(500, error.message || "Internal server error");
    }
  }
);

async function queryAllGroupKeys(tableName: string, groupSlug: string): Promise<ItemKey[]> {
  const keys: ItemKey[] = [];
  let startKey: Record<string, AttributeValue> | undefined;
  let pages = 0;

  do {
    if (pages >= MAX_QUERY_PAGES) {
      console.error("deleteGroup: query page limit reached", { groupSlug, pages });
      throw new Error("Kunde inte läsa hela kören.");
    }
    const queryResponse = await dbClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `GROUP#${groupSlug}` } },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: startKey,
      })
    );
    for (const item of queryResponse.Items ?? []) {
      if (item.PK && item.SK) {
        keys.push({ PK: item.PK, SK: item.SK });
      }
    }
    startKey = queryResponse.LastEvaluatedKey;
    pages += 1;
  } while (startKey);

  return keys;
}

async function batchDeleteKeys(tableName: string, keys: ItemKey[]): Promise<void> {
  for (let offset = 0; offset < keys.length; offset += BATCH_WRITE_SIZE) {
    const chunk = keys.slice(offset, offset + BATCH_WRITE_SIZE);
    let pending: WriteRequest[] = chunk.map((key) => ({
      DeleteRequest: { Key: { PK: key.PK, SK: key.SK } },
    }));
    let attempt = 0;

    while (pending.length > 0) {
      if (attempt >= MAX_BATCH_RETRIES) {
        console.error("deleteGroup: unprocessed items remain", {
          tableName,
          count: pending.length,
        });
        throw new Error("Kunde inte radera alla rader i kören.");
      }
      if (attempt > 0) {
        await sleep(50 * 2 ** attempt);
      }
      const result = await dbClient.send(
        new BatchWriteItemCommand({
          RequestItems: { [tableName]: pending },
        })
      );
      const unprocessed = result.UnprocessedItems?.[tableName];
      if (!unprocessed?.length) {
        break;
      }
      pending = unprocessed;
      attempt += 1;
    }
  }
}