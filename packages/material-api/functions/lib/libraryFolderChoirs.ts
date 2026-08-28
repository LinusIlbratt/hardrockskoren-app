import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  BatchWriteItemCommand,
  BatchGetItemCommand,
  type AttributeValue,
  type WriteRequest,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { nanoid } from "nanoid";

export const MAX_CHOIR_TARGETS = 50;
export const FOLDER_PATH_MAX = 200;
export const GROUP_SLUG_MAX = 64;
export const GROUP_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

export function normalizeFolderPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed || trimmed.length > FOLDER_PATH_MAX) return null;
  if (trimmed.includes("..") || trimmed.includes("\\")) return null;
  return trimmed;
}

export function normalizeGroupSlugs(raw: unknown):
  | { ok: true; slugs: string[] }
  | { ok: false; message: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, message: "groupSlugs must be an array." };
  }
  if (raw.length === 0) {
    return { ok: false, message: "groupSlugs must not be empty." };
  }
  if (raw.length > MAX_CHOIR_TARGETS) {
    return {
      ok: false,
      message: `Högst ${MAX_CHOIR_TARGETS} körer kan väljas åt gången.`,
    };
  }

  const slugs: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") {
      return { ok: false, message: "Each groupSlug must be a string." };
    }
    const slug = entry.trim();
    if (!slug || slug.length > GROUP_SLUG_MAX || !GROUP_SLUG_PATTERN.test(slug)) {
      return { ok: false, message: `Ogiltigt körnamn: ${entry}` };
    }
    const key = slug.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    slugs.push(slug);
  }

  if (slugs.length === 0) {
    return { ok: false, message: "groupSlugs must not be empty." };
  }
  return { ok: true, slugs };
}

async function queryAllItems(input: ConstructorParameters<typeof QueryCommand>[0]) {
  const items: Record<string, AttributeValue>[] = [];
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

  do {
    const resp = await dbClient.send(
      new QueryCommand({
        ...input,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    if (resp.Items?.length) {
      items.push(...resp.Items);
    }
    lastEvaluatedKey = resp.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

export async function assertChoirsExist(
  tableName: string,
  groupSlugs: string[]
): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  let pendingKeys = groupSlugs.map((slug) => ({
    PK: { S: `GROUP#${slug}` },
    SK: { S: "METADATA" },
  }));
  const found = new Set<string>();

  for (let attempt = 0; attempt < 2 && pendingKeys.length > 0; attempt++) {
    const result = await dbClient.send(
      new BatchGetItemCommand({
        RequestItems: {
          [tableName]: { Keys: pendingKeys },
        },
      })
    );

    for (const item of result.Responses?.[tableName] ?? []) {
      const pk = item.PK?.S;
      if (pk?.startsWith("GROUP#")) {
        found.add(pk.slice("GROUP#".length));
      }
    }

    const unprocessed = result.UnprocessedKeys?.[tableName]?.Keys;
    pendingKeys = Array.isArray(unprocessed) ? unprocessed : [];
  }

  if (pendingKeys.length > 0) {
    throw new Error("Could not verify all target choirs (BatchGet unprocessed keys).");
  }

  const missing = groupSlugs.filter((slug) => !found.has(slug));
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true };
}

export type LinkedChoir = {
  groupSlug: string;
  repertoireId: string;
};

/** Query repertoires under GROUP#slug; match exact title (folder path). */
export async function findLinkedRepertoire(
  tableName: string,
  groupSlug: string,
  folderPath: string
): Promise<LinkedChoir | null> {
  const items = await queryAllItems({
    TableName: tableName,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
    ExpressionAttributeValues: {
      ":pk": { S: `GROUP#${groupSlug}` },
      ":skPrefix": { S: "REPERTOIRE#" },
    },
    ProjectionExpression: "repertoireId, title, SK",
  });

  for (const raw of items) {
    const sk = raw.SK?.S ?? "";
    if (sk.includes("#MATERIAL#")) continue;
    const item = unmarshall(raw) as { repertoireId?: string; title?: string };
    if ((item.title || "").trim() !== folderPath) continue;
    const repertoireId = (item.repertoireId || "").trim();
    if (!repertoireId) continue;
    return { groupSlug, repertoireId };
  }
  return null;
}

export type FolderMaterial = {
  materialId: string;
};

export async function queryFolderMaterials(
  tableName: string,
  folderPath: string
): Promise<FolderMaterial[]> {
  const searchPrefix = `${folderPath}/`;
  const items = await queryAllItems({
    TableName: tableName,
    IndexName: "GSI2",
    KeyConditionExpression: "GSI1PK = :gsi1pk AND begins_with(filePath, :prefix)",
    ExpressionAttributeValues: {
      ":gsi1pk": { S: "MATERIALS" },
      ":prefix": { S: searchPrefix },
    },
    ProjectionExpression: "materialId",
  });

  const out: FolderMaterial[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const materialId = (unmarshall(raw) as { materialId?: string }).materialId?.trim();
    if (!materialId || seen.has(materialId)) continue;
    seen.add(materialId);
    out.push({ materialId });
  }
  return out;
}

export type AddChoirResult =
  | { groupSlug: string; status: "added"; repertoireId: string; linkedCount: number }
  | { groupSlug: string; status: "skipped"; repertoireId: string; reason: "already_linked" }
  | { groupSlug: string; status: "failed"; message: string };

export async function addFolderToChoir(
  tableName: string,
  groupSlug: string,
  folderPath: string,
  materials: FolderMaterial[]
): Promise<AddChoirResult> {
  try {
    const existing = await findLinkedRepertoire(tableName, groupSlug, folderPath);
    if (existing) {
      return {
        groupSlug,
        status: "skipped",
        repertoireId: existing.repertoireId,
        reason: "already_linked",
      };
    }

    const repertoireId = nanoid();
    const createdAt = new Date().toISOString();
    const repertoireItem = {
      PK: `GROUP#${groupSlug}`,
      SK: `REPERTOIRE#${repertoireId}`,
      repertoireId,
      title: folderPath,
      createdAt,
      type: "Repertoire",
    };

    await dbClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(repertoireItem),
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      })
    );

    if (materials.length === 0) {
      return { groupSlug, status: "added", repertoireId, linkedCount: 0 };
    }

    const writes: WriteRequest[] = materials.map((material) => ({
      PutRequest: {
        Item: marshall({
          PK: `REPERTOIRE#${repertoireId}`,
          SK: `MATERIAL#${material.materialId}`,
          materialId: material.materialId,
          repertoireId,
          groupName: groupSlug,
          createdAt,
          linkedAt: createdAt,
          type: "RepertoireMaterialLink",
        }),
      },
    }));

    for (let i = 0; i < writes.length; i += 25) {
      const chunk = writes.slice(i, i + 25);
      await dbClient.send(
        new BatchWriteItemCommand({
          RequestItems: { [tableName]: chunk },
        })
      );
    }

    return {
      groupSlug,
      status: "added",
      repertoireId,
      linkedCount: materials.length,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Kunde inte lägga till mappen.";
    console.error("addFolderToChoir failed", { groupSlug, folderPath, error });
    return { groupSlug, status: "failed", message };
  }
}
