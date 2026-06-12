import {
  BatchGetCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

/** DynamoDB BatchGetItem max keys per request */
export const BATCH_GET_MAX_KEYS = 100;

const INTERNAL_KEYS = new Set([
  "PK",
  "SK",
  "GSI1PK",
  "GSI1SK",
]);

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Tar bort partition/sort-nycklar och GSI-attribut innan svar till klient.
 */
export function sanitizeMaterialForClient(
  raw: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (INTERNAL_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function hasRequiredMaterialFields(
  o: Record<string, unknown>
): boolean {
  return typeof o.materialId === "string" && typeof o.fileKey === "string";
}

/**
 * Hämtar globala material (PK/SK = MATERIAL#id) i batch om max 100 id:n per anrop.
 */
export async function batchGetGlobalMaterialsByIds(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  materialIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const unique = [
    ...new Set(materialIds.map((id) => id.trim()).filter(Boolean)),
  ];
  const byId = new Map<string, Record<string, unknown>>();
  if (unique.length === 0) {
    return byId;
  }

  for (const batch of chunkArray(unique, BATCH_GET_MAX_KEYS)) {
    const res = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: batch.map((id) => ({
              PK: `MATERIAL#${id}`,
              SK: `MATERIAL#${id}`,
            })),
          },
        },
      })
    );

    const items = res.Responses?.[tableName] ?? [];
    for (const item of items) {
      const rec = item as Record<string, unknown>;
      const mid = rec.materialId;
      if (typeof mid === "string") {
        byId.set(mid, rec);
      }
    }
  }

  return byId;
}
