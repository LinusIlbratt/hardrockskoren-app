import {
  AttributeValue,
  BatchGetItemCommand,
  DynamoDBClient,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import { requireGroupAccessResponse } from "./lib/requireGroupAccess";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;
const BATCH_GET_LIMIT = 100;

type DynamoKey = Record<string, AttributeValue>;

type LinkLabel = {
  materialId: string;
  voiceLabel?: string;
  songTitle?: string;
};

function textOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function linkLabel(item: Record<string, AttributeValue>): LinkLabel | null {
  const row = unmarshall(item) as {
    materialId?: unknown;
    SK?: unknown;
    voiceLabel?: unknown;
    songTitle?: unknown;
  };
  let materialId = textOrEmpty(row.materialId);
  const sortKey = textOrEmpty(row.SK);
  if (!materialId && sortKey.startsWith("MATERIAL#")) {
    materialId = sortKey.slice("MATERIAL#".length).trim();
  }
  if (!materialId || materialId.includes("#")) return null;
  const voiceLabel = textOrEmpty(row.voiceLabel);
  const songTitle = textOrEmpty(row.songTitle);
  return {
    materialId,
    ...(voiceLabel ? { voiceLabel } : {}),
    ...(songTitle ? { songTitle } : {}),
  };
}

async function batchGetMaterials(tableName: string, keys: DynamoKey[]): Promise<Record<string, AttributeValue>[]> {
  const found: Record<string, AttributeValue>[] = [];
  for (let offset = 0; offset < keys.length; offset += BATCH_GET_LIMIT) {
    let pending = keys.slice(offset, offset + BATCH_GET_LIMIT);
    for (let attempt = 0; pending.length > 0 && attempt < 5; attempt += 1) {
      const response = await dbClient.send(
        new BatchGetItemCommand({
          RequestItems: {
            [tableName]: { Keys: pending },
          },
        })
      );
      found.push(...(response.Responses?.[tableName] ?? []));
      pending = (response.UnprocessedKeys?.[tableName]?.Keys ?? []) as DynamoKey[];
    }
    if (pending.length > 0) {
      throw new Error("BatchGetItem left unprocessed material keys.");
    }
  }
  return found;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error.");
  }

  try {
    const { groupName, repertoireId } = event.pathParameters || {};

    const authDenied = await requireGroupAccessResponse(
      event.requestContext.authorizer?.lambda,
      groupName
    );
    if (authDenied) {
      return authDenied;
    }

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

    const labelsById = new Map<string, LinkLabel>();
    const materialKeysToGet: DynamoKey[] = [];
    for (const item of linkItems) {
      const label = linkLabel(item);
      if (!label || labelsById.has(label.materialId)) continue;
      labelsById.set(label.materialId, label);
      materialKeysToGet.push({
        PK: { S: `MATERIAL#${label.materialId}` },
        SK: { S: `MATERIAL#${label.materialId}` },
      });
    }

    const materialItems = await batchGetMaterials(MAIN_TABLE, materialKeysToGet);
    const materials = materialItems.map((item) => {
      const material = unmarshall(item) as { materialId?: unknown; title?: unknown };
      const materialId = textOrEmpty(material.materialId);
      const label = labelsById.get(materialId);
      return {
        ...material,
        ...(label?.voiceLabel ? { voiceLabel: label.voiceLabel } : {}),
        ...(label?.songTitle ? { songTitle: label.songTitle } : {}),
      };
    });

    materials.sort((a, b) => textOrEmpty(a.title).localeCompare(textOrEmpty(b.title)));

    return sendResponse(materials, 200);

  } catch (error: any) {
    console.error("Error fetching materials for repertoire:", error);
    return sendError(500, error.message);
  }
};