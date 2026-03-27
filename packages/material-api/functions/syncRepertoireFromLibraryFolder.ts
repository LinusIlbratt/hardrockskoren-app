import {
  DynamoDBClient,
  QueryCommand,
  BatchWriteItemCommand,
  WriteRequest,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

function toChunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
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

    const { groupName, repertoireId } = event.pathParameters || {};
    if (!groupName || !repertoireId) {
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

    // 1) Hitta allt material i biblioteksmappen
    const folderMaterialsQuery = new QueryCommand({
      TableName: MAIN_TABLE,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI1PK = :gsi1pk AND begins_with(filePath, :prefix)",
      ExpressionAttributeValues: {
        ":gsi1pk": { S: "MATERIALS" },
        ":prefix": { S: searchPrefix },
      },
    });
    const folderMaterialsResp = await dbClient.send(folderMaterialsQuery);
    const folderMaterialIds = new Set(
      (folderMaterialsResp.Items || [])
        .map((item) => unmarshall(item) as { materialId?: string })
        .map((m) => (m.materialId || "").trim())
        .filter((id) => id.length > 0)
    );

    // 2) Hämta befintliga länkar för repertoaren
    const repertoireLinksQuery = new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `REPERTOIRE#${repertoireId}` },
        ":skPrefix": { S: "MATERIAL#" },
      },
    });
    const repertoireLinksResp = await dbClient.send(repertoireLinksQuery);
    const linkedMaterialIds = new Set(
      (repertoireLinksResp.Items || [])
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
        groupName,
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
    return sendError(500, error.message || "Internal server error");
  }
};
