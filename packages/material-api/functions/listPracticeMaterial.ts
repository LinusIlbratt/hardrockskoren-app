// --- KORRIGERING: Importera rätt typer ---
import { DynamoDBClient, QueryCommand, QueryCommandInput } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../core/types";
import { sendResponse, sendError } from "../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (
  // --- KORRIGERING: Använd rätt event-typ ---
  event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: MAIN_TABLE not set.");
  }

  try {
    // Behörighetskontroll sker redan i authorizern. Vi vet att användaren
    // är inloggad eftersom denna endpoint kräver en giltig token.

    const queryParams: QueryCommandInput = {
      TableName: MAIN_TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": { S: "SJUNGUPP#MATERIALS" },
      },
    };

    let allItems: any[] = [];
    let lastEvaluatedKey: any;

    // Paginering för att hämta alla material, även om det är fler än 100.
    do {
      const command = new QueryCommand({
        ...queryParams,
        ExclusiveStartKey: lastEvaluatedKey,
      });
      const { Items, LastEvaluatedKey } = await dbClient.send(command);
      
      if (Items) {
        allItems.push(...Items);
      }
      
      lastEvaluatedKey = LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Omvandla från DynamoDB-format till vanlig JSON
    const materials = allItems.map(item => unmarshall(item));

    // Skicka den korrekta arrayen till din sendResponse-funktion
    return sendResponse(materials, 200);

  } catch (error: any) {
    console.error("Error fetching Sjungupp materials:", error);
    return sendError(500, error.message);
  }
};