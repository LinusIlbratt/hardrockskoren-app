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
    const { repertoireId } = event.pathParameters || {};
    if (!repertoireId) {
      return sendError(400, "Repertoire ID is required.");
    }

    // STEG 1: Hitta alla kopplingsobjekt för denna repertoar
    const queryCommand = new QueryCommand({
      TableName: MAIN_TABLE,
      // KORRIGERING: Använd den nya, enklare nyckelstrukturen
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `REPERTOIRE#${repertoireId}` }, // <-- HÄR ÄR ÄNDRINGEN
        ":skPrefix": { S: "MATERIAL#" },
      },
    });

    const { Items: linkItems } = await dbClient.send(queryCommand);

    if (!linkItems || linkItems.length === 0) {
      return sendResponse([], 200);
    }

    // STEG 2: Plocka ut alla materialId:n (denna logik är redan korrekt)
    const materialKeysToGet = linkItems.map(item => {
      const materialId = unmarshall(item).materialId; 
      // Antagande: Material-objekten har en PK/SK-struktur som 'MATERIAL#<id>'
      return {
        PK: { S: `MATERIAL#${materialId}` },
        SK: { S: `MATERIAL#${materialId}` },
      };
    });

    // STEG 3: Hämta alla material-detaljer (denna logik är redan korrekt)
    const batchGetCommand = new BatchGetItemCommand({
      RequestItems: {
        [MAIN_TABLE]: {
          Keys: materialKeysToGet,
        },
      },
    });

    const { Responses } = await dbClient.send(batchGetCommand);
    const materials = Responses?.[MAIN_TABLE].map(item => unmarshall(item)) || [];
    
    materials.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return sendResponse(materials, 200);

  } catch (error: any) {
    console.error("Error fetching materials for repertoire:", error);
    return sendError(500, error.message);
  }
};