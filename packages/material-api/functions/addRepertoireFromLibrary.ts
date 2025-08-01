import { DynamoDBClient, PutItemCommand, QueryCommand, BatchWriteItemCommand, WriteRequest } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import { nanoid } from "nanoid";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

type AuthorizedEvent = APIGatewayProxyEvent & {
  requestContext: { authorizer: { lambda: { role?: string } } }
};

export const handler = async (event: AuthorizedEvent): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    // 1. BEHÖRIGHETSKONTROLL
    const allowedRoles = ['admin', 'leader'];
    const userRole = event.requestContext.authorizer?.lambda?.role;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    // 2. VALIDERA INPUT
    const { groupName } = event.pathParameters || {};
    if (!groupName) return sendError(400, "Group name is required in the path.");
    if (!event.body) return sendError(400, "Request body is required.");
    const { folderPath } = JSON.parse(event.body);
    if (!folderPath) return sendError(400, "folderPath is required in the request body.");

    // 3. SKAPA DET NYA REPERTOAR-OBJEKTET
    const repertoireId = nanoid();
    const repertoireItem = {
      PK: `GROUP#${groupName}`,
      SK: `REPERTOIRE#${repertoireId}`,
      repertoireId,
      title: folderPath,
      createdAt: new Date().toISOString(),
      type: "Repertoire",
    };
    const createRepertoireCommand = new PutItemCommand({
      TableName: MAIN_TABLE,
      Item: marshall(repertoireItem),
      ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)"
    });
    await dbClient.send(createRepertoireCommand);

    // ✅ KORRIGERINGEN ÄR HÄR
    const searchPath = `${folderPath}/`; // Lägg till ett avslutande snedstreck

    // 4. HITTA ALLT MATERIAL I DEN VALDA MAPPEN (via GSI2)
    const findMaterialsCommand = new QueryCommand({
      TableName: MAIN_TABLE,
      IndexName: 'GSI2',
      KeyConditionExpression: "GSI1PK = :gsi1pk AND begins_with(filePath, :folderPath)",
      ExpressionAttributeValues: {
        ":gsi1pk": { S: "MATERIALS" },
        ":folderPath": { S: searchPath }, // Använd den nya variabeln med snedstreck
      },
    });
    const { Items: materialItems } = await dbClient.send(findMaterialsCommand);
    if (!materialItems || materialItems.length === 0) {
      return sendResponse({ message: "Repertoire created from empty folder.", item: repertoireItem }, 201);
    }
    const materials = materialItems.map(item => unmarshall(item));

    // 5. SKAPA LÄNK-OBJEKTEN (oförändrat)
    const linkRequests: WriteRequest[] = materials.map(material => {
      const linkItem = {
        PK: `REPERTOIRE#${repertoireId}`,
        SK: `MATERIAL#${material.materialId}`,
        materialId: material.materialId,
        repertoireId: repertoireId,
        createdAt: new Date().toISOString(),
        type: "RepertoireMaterialLink",
      };
      return { PutRequest: { Item: marshall(linkItem) } };
    });

    for (let i = 0; i < linkRequests.length; i += 25) {
      const batch = linkRequests.slice(i, i + 25);
      const batchWriteCommand = new BatchWriteItemCommand({
        RequestItems: { [MAIN_TABLE]: batch }
      });
      await dbClient.send(batchWriteCommand);
    }

    return sendResponse({ message: `Repertoire created and linked to ${materials.length} material(s).`, item: repertoireItem }, 201);

  } catch (error: any) {
    console.error("Error creating repertoire from library:", error);
    if (error.name === 'ConditionalCheckFailedException') {
      return sendError(409, 'A repertoire item with this ID already exists.');
    }
    return sendError(500, error.message || "Internal server error");
  }
};