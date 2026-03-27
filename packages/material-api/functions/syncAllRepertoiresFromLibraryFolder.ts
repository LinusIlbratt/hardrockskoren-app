import {
  DynamoDBClient,
  ScanCommand,
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
    console.error("syncAll: MAIN_TABLE env var missing");
    return sendError(500, "Server configuration error.");
  }

  const toErrMsg = (e: unknown): string => {
    if (typeof e === "string") return e;
    if (e instanceof Error) {
      const name = e.name ? `${e.name}: ` : "";
      return `${name}${e.message || "Unknown error"}`;
    }
    if (e && typeof e === "object") {
      const anyE = e as any;
      const msg = anyE.message || anyE.errorMessage || anyE.reason;
      const name = anyE.name || anyE.code || anyE.Code;
      // Avoid throwing while stringifying the error; keep it safe/shortish.
      let raw = "";
      try {
        raw = JSON.stringify(anyE);
      } catch {
        raw = "";
      }
      const parts = [
        name ? `name=${String(name)}` : "",
        msg ? `message=${String(msg)}` : "",
        raw && raw !== "{}" ? `raw=${raw}` : "",
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" | ") : "Internal server error";
    }
    return "Internal server error";
  };

  try {
    const role = event.requestContext.authorizer?.lambda?.role;
    console.log("syncAll: invoked", {
      role,
      routeKey: (event as any).routeKey,
      path: event.rawPath,
    });
    if (!role || role !== "admin") {
      console.warn("syncAll: forbidden", { role });
      return sendError(403, "Forbidden: Admin access required.");
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

    // 1) Find all materials currently in the library folder (via GSI2)
    let folderMaterialsResp;
    try {
      folderMaterialsResp = await dbClient.send(
        new QueryCommand({
          TableName: MAIN_TABLE,
          IndexName: "GSI2",
          KeyConditionExpression: "GSI1PK = :gsi1pk AND begins_with(filePath, :prefix)",
          ExpressionAttributeValues: {
            ":gsi1pk": { S: "MATERIALS" },
            ":prefix": { S: searchPrefix },
          },
          ProjectionExpression: "materialId",
        })
      );
    } catch (e) {
      console.error("syncAll: query folder materials failed", e);
      return sendError(500, `Failed to query library materials: ${toErrMsg(e)}`);
    }
    const folderMaterialIds = new Set(
      (folderMaterialsResp.Items || [])
        .map((item) => unmarshall(item) as { materialId?: string })
        .map((m) => (m.materialId || "").trim())
        .filter((id) => id.length > 0)
    );

    // 2) Scan for all Repertoire items whose title matches the folder path
    let scanResp;
    try {
      scanResp = await dbClient.send(
        new ScanCommand({
          TableName: MAIN_TABLE,
          FilterExpression: "#type = :type AND title = :title",
          ExpressionAttributeNames: { "#type": "type" },
          ExpressionAttributeValues: {
            ":type": { S: "Repertoire" },
            ":title": { S: normalizedFolderPath },
          },
          // groupName is derived from PK (stored as "GROUP#{groupName}") on Repertoire items.
          ProjectionExpression: "repertoireId, PK",
        })
      );
    } catch (e) {
      console.error("syncAll: scan repertoires failed", e);
      return sendError(500, `Failed to scan repertoires: ${toErrMsg(e)}`);
    }

    const matchingRepertoires = (scanResp.Items || []).map(
      (item) =>
        unmarshall(item) as { repertoireId?: string; PK?: string }
    );

    if (matchingRepertoires.length === 0) {
      return sendResponse(
        {
          message:
            "No choir repertoires are linked to this folder. Add this folder to a choir's repertoire first.",
          folderPath: normalizedFolderPath,
          syncedCount: 0,
          results: [],
        },
        200
      );
    }

    // 3) For each matching repertoire, diff and sync
    const results: {
      repertoireId: string;
      groupName: string;
      linkedCount: number;
      unlinkedCount: number;
    }[] = [];

    for (const reper of matchingRepertoires) {
      const repertoireId = (reper.repertoireId || "").trim();
      const pk = reper.PK || "";
      const groupName = pk.startsWith("GROUP#") ? pk.slice("GROUP#".length) : "";

      if (!repertoireId || !groupName) continue; // defensive: skip malformed items
      let repertoireLinksResp;
      try {
        repertoireLinksResp = await dbClient.send(
          new QueryCommand({
            TableName: MAIN_TABLE,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
            ExpressionAttributeValues: {
              ":pk": { S: `REPERTOIRE#${repertoireId}` },
              ":skPrefix": { S: "MATERIAL#" },
            },
            ProjectionExpression: "materialId",
          })
        );
      } catch (e) {
        console.error("syncAll: query repertoire links failed", e);
        return sendError(500, `Failed to query repertoire links for ${repertoireId}: ${toErrMsg(e)}`);
      }
      const linkedMaterialIds = new Set(
        (repertoireLinksResp.Items || [])
          .map((item) => unmarshall(item) as { materialId?: string })
          .map((m) => (m.materialId || "").trim())
          .filter((id) => id.length > 0)
      );

      const toLink = Array.from(folderMaterialIds).filter(
        (id) => !linkedMaterialIds.has(id)
      );
      const toUnlink = Array.from(linkedMaterialIds).filter(
        (id) => !folderMaterialIds.has(id)
      );

      const writes: WriteRequest[] = [];

      for (const materialId of toLink) {
        writes.push({
          PutRequest: {
            Item: marshall({
              PK: `REPERTOIRE#${repertoireId}`,
              SK: `MATERIAL#${materialId}`,
              materialId,
              repertoireId,
              groupName,
              linkedAt: new Date().toISOString(),
              type: "RepertoireMaterialLink",
            }),
          },
        });
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

      // If nothing changed, avoid doing any DynamoDB writes.
      if (writes.length === 0) {
        results.push({
          repertoireId,
          groupName,
          linkedCount: toLink.length,
          unlinkedCount: toUnlink.length,
        });
        continue;
      }

      for (const chunk of toChunks(writes, 25)) {
        try {
          await dbClient.send(
            new BatchWriteItemCommand({
              RequestItems: { [MAIN_TABLE]: chunk },
            })
          );
        } catch (e) {
          console.error("syncAll: batchWrite failed", e);
          return sendError(500, `Batch write failed for ${repertoireId}: ${toErrMsg(e)}`);
        }
      }

      results.push({
        repertoireId,
        groupName,
        linkedCount: toLink.length,
        unlinkedCount: toUnlink.length,
      });
    }

    return sendResponse(
      {
        message: `Synced ${matchingRepertoires.length} choir repertoire(s) from library folder.`,
        folderPath: normalizedFolderPath,
        syncedCount: matchingRepertoires.length,
        results,
      },
      200
    );
  } catch (error: any) {
    console.error("Error syncing all repertoires from library folder:", error);
    return sendError(500, toErrMsg(error));
  }
};
