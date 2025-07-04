// functions/listMaterialsInRepertoire.handler

import { DynamoDBClient, QueryCommand, BatchGetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error.");
  }

  try {
    const { groupName, repertoireId } = event.pathParameters || {};
    if (!groupName || !repertoireId) {
      return sendError(400, "Group name and Repertoire ID are required.");
    }

    // STEG 1: Hitta alla kopplingsobjekt för denna repertoar
    const queryCommand = new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `GROUP#${groupName}#REPERTOIRE#${repertoireId}` },
        ":skPrefix": { S: "MATERIAL#" },
      },
    });

    const { Items: linkItems } = await dbClient.send(queryCommand);

    if (!linkItems || linkItems.length === 0) {
      return sendResponse([], 200); // Inget material kopplat, returnera tom lista
    }

    // STEG 2: Plocka ut alla materialId:n från kopplingsobjekten
    const materialKeysToGet = linkItems.map(item => {
      const materialId = unmarshall(item).materialId; 
      return {
        PK: { S: `MATERIAL#${materialId}` },
        SK: { S: `MATERIAL#${materialId}` },
      };
    });

    // STEG 3: Hämta alla material-detaljer i en enda effektiv batch-förfrågan
    const batchGetCommand = new BatchGetItemCommand({
      RequestItems: {
        [MAIN_TABLE]: {
          Keys: materialKeysToGet,
        },
      },
    });

    const { Responses } = await dbClient.send(batchGetCommand);
    const materials = Responses?.[MAIN_TABLE].map(item => unmarshall(item)) || [];

    // Sortera efter titel för konsekvent ordning
    materials.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return sendResponse(materials, 200);

  } catch (error: any) {
    console.error("Error fetching materials for repertoire:", error);
    return sendError(500, error.message);
  }
};