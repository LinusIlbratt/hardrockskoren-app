import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  QueryCommandInput,
  BatchWriteItemCommand,
  WriteRequest,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import { normalizeGroupSlug, requireGroupAccessResponse } from "./lib/requireGroupAccess";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;
const MAX_QUERY_PAGES = 200;

function toChunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function queryAllItems(
  input: Omit<QueryCommandInput, "ExclusiveStartKey" | "TableName">
): Promise<Record<string, AttributeValue>[]> {
  if (!MAIN_TABLE) {
    throw new Error("MAIN_TABLE is not set.");
  }
  const items: Record<string, AttributeValue>[] = [];
  let startKey: Record<string, AttributeValue> | undefined;
  let pages = 0;

  do {
    if (pages >= MAX_QUERY_PAGES) {
      throw new Error("Query page limit reached.");
    }
    const page = await dbClient.send(
      new QueryCommand({
        ...input,
        TableName: MAIN_TABLE,
        ExclusiveStartKey: startKey,
      })
    );
    items.push(...(page.Items ?? []));
    startKey = page.LastEvaluatedKey;
    pages += 1;
  } while (startKey);

  return items;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error.");
  }

  try {
    const role = event.requestContext.authorizer?.lambda?.role;
    if (!role || (role !== "admin" && role !== "leader")) {
      return sendError(403, "Forbidden: You do not have permission to perform this action.");
    }

    const { groupName, repertoireId: rawRepertoireId } = event.pathParameters || {};
    const authDenied = await requireGroupAccessResponse(
      event.requestContext.authorizer?.lambda,
      groupName
    );
    if (authDenied) {
      return authDenied;
    }
    const groupSlug = normalizeGroupSlug(groupName);
    const repertoireId = (rawRepertoireId || "").trim();
    if (!groupSlug || !repertoireId || repertoireId.includes("#") || repertoireId.includes("/")) {
      return sendError(400, "Group name and repertoireId are required.");
    }
    if (!event.body) {
      return sendError(400, "Request body is required.");
    }

    let folderPath = "";
    try {
      const body = JSON.parse(event.body) as { folderPath?: string };
      folderPath = body.folderPath?.trim() || "";
    } catch {
      return sendError(400, "Invalid JSON format in request body.");
    }
    if (!folderPath) {
      return sendError(400, "folderPath is required.");
    }

    const normalizedFolderPath = folderPath.replace(/^\/+|\/+$/g, "");
    const searchPrefix = `${normalizedFolderPath}/`;

    const repertoireHeader = await dbClient.send(
      new GetItemCommand({
        TableName: MAIN_TABLE,
        Key: marshall({
          PK: `GROUP#${groupSlug}`,
          SK: `REPERTOIRE#${repertoireId}`,
        }),
        ProjectionExpression: "repertoireId",
      })
    );
    if (!repertoireHeader.Item) {
      return sendError(404, "Repertoaren hittades inte.");
    }

    // 1) Hitta allt material i biblioteksmappen
    const folderMaterialItems = await queryAllItems({
      IndexName: "GSI2",
      KeyConditionExpression: "GSI1PK = :gsi1pk AND begins_with(filePath, :prefix)",
      ExpressionAttributeValues: {
        ":gsi1pk": { S: "MATERIALS" },
        ":prefix": { S: searchPrefix },
      },
    });
    const folderMaterialIds = new Set(
      folderMaterialItems
        .map((item) => unmarshall(item) as { materialId?: string })
        .map((m) => (m.materialId || "").trim())
        .filter((id) => id.length > 0)
    );

    // 2) Hämta befintliga länkar för repertoaren, alla sidor
    const repertoireLinkItems = await queryAllItems({
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `REPERTOIRE#${repertoireId}` },
        ":skPrefix": { S: "MATERIAL#" },
      },
    });
    const linkedMaterialIds = new Set(
      repertoireLinkItems
        .map((item) => unmarshall(item) as { materialId?: string })
        .map((m) => (m.materialId || "").trim())
        .filter((id) => id.length > 0)
    );

    // 3) Diff
    const toLink = Array.from(folderMaterialIds).filter((id) => !linkedMaterialIds.has(id));
    const toUnlink = Array.from(linkedMaterialIds).filter((id) => !folderMaterialIds.has(id));

    const writes: WriteRequest[] = [];

    for (const materialId of toLink) {
      const item = {
        PK: `REPERTOIRE#${repertoireId}`,
        SK: `MATERIAL#${materialId}`,
        materialId,
        repertoireId,
        groupName: groupSlug,
        linkedAt: new Date().toISOString(),
        type: "RepertoireMaterialLink",
      };
      writes.push({ PutRequest: { Item: marshall(item) } });
    }

    for (const materialId of toUnlink) {
      writes.push({
        DeleteRequest: {
          Key: marshall({
            PK: `REPERTOIRE#${repertoireId}`,
            SK: `MATERIAL#${materialId}`,
          }),
        },
      });
    }

    for (const chunk of toChunks(writes, 25)) {
      await dbClient.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [MAIN_TABLE]: chunk,
          },
        })
      );
    }

    return sendResponse(
      {
        message: "Repertoire synced with library folder.",
        folderPath: normalizedFolderPath,
        linkedCount: toLink.length,
        unlinkedCount: toUnlink.length,
        totalInFolder: folderMaterialIds.size,
        totalLinkedAfterSync: folderMaterialIds.size,
      },
      200
    );
  } catch (error: any) {
    console.error("Error syncing repertoire from library folder:", error);
    return sendError(500, "Ett internt serverfel uppstod");
  }
};
