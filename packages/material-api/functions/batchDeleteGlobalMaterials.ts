import {
  DynamoDBClient,
  BatchGetItemCommand,
  BatchWriteItemCommand,
  WriteRequest,
  AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { S3Client, DeleteObjectsCommand, ObjectIdentifier } from "@aws-sdk/client-s3";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const MAIN_TABLE = process.env.MAIN_TABLE;
const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME;

const BATCH_SIZE = 25;
const MAX_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GlobalMaterialRow {
  materialId?: string;
  type?: string;
  fileKey?: string;
}

async function batchGetItems(keys: { PK: { S: string }; SK: { S: string } }[]): Promise<GlobalMaterialRow[]> {
  let pendingKeys: { PK: { S: string }; SK: { S: string } }[] = keys;
  const raw: Record<string, AttributeValue>[] = [];
  let attempt = 0;

  while (pendingKeys.length > 0) {
    if (attempt >= MAX_RETRIES) {
      console.error("batchDelete: BatchGetItem exceeded max retries");
      throw new Error("Could not read all material records.");
    }

    const getResult = await dbClient.send(
      new BatchGetItemCommand({
        RequestItems: {
          [MAIN_TABLE!]: { Keys: pendingKeys },
        },
      })
    );
    const gotBatch = getResult.Responses?.[MAIN_TABLE!] ?? [];
    raw.push(...gotBatch);

    const unprocessed = getResult.UnprocessedKeys?.[MAIN_TABLE!]?.Keys as
      | { PK: { S: string }; SK: { S: string } }[]
      | undefined;
    if (!unprocessed?.length) {
      break;
    }
    pendingKeys = unprocessed;
    attempt++;
    await sleep(40 * Math.pow(2, attempt));
  }

  return raw.map((item) => unmarshall(item) as GlobalMaterialRow);
}

async function batchWriteDeletesWithRetry(writeRequests: WriteRequest[]): Promise<void> {
  let pending: WriteRequest[] = writeRequests;
  let attempt = 0;

  while (pending.length > 0) {
    if (attempt >= MAX_RETRIES) {
      console.error("batchDelete: BatchWriteItem exceeded max retries");
      throw new Error("Could not delete all material records.");
    }

    const res = await dbClient.send(
      new BatchWriteItemCommand({
        RequestItems: { [MAIN_TABLE!]: pending },
      })
    );
    const unprocessed = res.UnprocessedItems?.[MAIN_TABLE!];
    if (!unprocessed?.length) {
      return;
    }
    pending = unprocessed;
    attempt++;
    await sleep(50 * Math.pow(2, attempt));
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE || !BUCKET_NAME) {
    return sendError(500, "Server configuration error.");
  }

  try {
    const role = event.requestContext.authorizer?.lambda?.role as string | undefined;
    if (role !== "admin") {
      return sendError(403, "Forbidden: You do not have permission.");
    }

    if (!event.body) {
      return sendError(400, "Request body is required.");
    }
    let parsed: { materialIds?: unknown };
    try {
      parsed = JSON.parse(event.body) as { materialIds?: unknown };
    } catch {
      return sendError(400, "Invalid JSON body.");
    }
    const { materialIds: rawIds } = parsed;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return sendError(400, "An array of materialIds is required.");
    }

    const materialIds = [...new Set(rawIds.map((id) => String(id).trim()).filter((id) => id.length > 0))];
    if (materialIds.length === 0) {
      return sendError(400, "No valid materialIds in request.");
    }

    let totalDeleted = 0;
    const allSkipped: string[] = [];

    for (let i = 0; i < materialIds.length; i += BATCH_SIZE) {
      const chunkOfIds = materialIds.slice(i, i + BATCH_SIZE);

      const keysToGet = chunkOfIds.map((id) => ({
        PK: { S: `MATERIAL#${id}` },
        SK: { S: `MATERIAL#${id}` },
      }));

      const items = await batchGetItems(keysToGet);

      const byRequestedId = new Map<string, GlobalMaterialRow>();
      for (const row of items) {
        if (row.materialId) {
          byRequestedId.set(row.materialId, row);
        }
      }

      const skippedInChunk: string[] = [];
      const globalRows: GlobalMaterialRow[] = [];

      for (const id of chunkOfIds) {
        const row = byRequestedId.get(id);
        if (!row) {
          skippedInChunk.push(id);
          continue;
        }
        if (row.type !== "GlobalMaterial") {
          skippedInChunk.push(id);
          continue;
        }
        globalRows.push(row);
      }

      allSkipped.push(...skippedInChunk);

      const idsToRemove = globalRows
        .map((r) => r.materialId)
        .filter((mid): mid is string => typeof mid === "string" && mid.length > 0);

      const s3Keys = globalRows
        .map((item) => item.fileKey)
        .filter((k): k is string => typeof k === "string" && k.length > 0);
      const uniqueKeys = [...new Set(s3Keys)];
      const keysToDeleteFromS3: ObjectIdentifier[] = uniqueKeys.map((key) => ({ Key: key }));

      if (keysToDeleteFromS3.length > 0) {
        const delResult = await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: { Objects: keysToDeleteFromS3 },
          })
        );
        if (delResult.Errors && delResult.Errors.length > 0) {
          console.error("batchDelete: S3 DeleteObjects errors", delResult.Errors);
          return sendError(
            500,
            "Kunde inte radera alla filer i lagringen. Inga databasposter har raderats för denna begäran."
          );
        }
      }

      const keysToDeleteFromDB: WriteRequest[] = idsToRemove.map((id) => ({
        DeleteRequest: {
          Key: {
            PK: { S: `MATERIAL#${id}` },
            SK: { S: `MATERIAL#${id}` },
          },
        },
      }));

      if (keysToDeleteFromDB.length > 0) {
        await batchWriteDeletesWithRetry(keysToDeleteFromDB);
      }

      totalDeleted += idsToRemove.length;
    }

    const skippedCount = allSkipped.length;
    const message =
      skippedCount === 0
        ? `${totalDeleted} material(s) deleted successfully.`
        : `${totalDeleted} material(s) deleted. ${skippedCount} id(s) skipped (not found or not global library material).`;

    return sendResponse(
      {
        message,
        deletedCount: totalDeleted,
        skippedCount,
        ...(skippedCount > 0 && skippedCount <= 50 ? { skippedIds: allSkipped } : {}),
      },
      200
    );
  } catch (error: any) {
    console.error("Error batch deleting materials:", error);
    return sendError(500, error.message || "An internal error occurred during the deletion process.");
  }
};
