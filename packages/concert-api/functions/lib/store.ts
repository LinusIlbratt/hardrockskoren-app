import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
  BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  LIST_GSI1_PK_LEGACY,
  LIST_SHARD_LOOKBACK_YEARS,
  SHARED_CONCERT_REF_SK_PREFIX,
  SIGNUP_SK_PREFIX,
  SIGNUP_CHILD_SK_END,
  clampListLimit,
  concertVisibleToChoir,
  groupAudiencePk,
  sharedConcertPk,
  sharedConcertMetaSk,
  sharedConcertRefSk,
  concertSignupRefSk,
  legacyConcertSignupSk,
  listGsi1PkForYear,
  yearFromGsi1Sk,
  todayInStockholm,
  isConcertOpenForSignup,
  isSharedConcertVisible,
  ALL_AUDIENCE_TARGET,
  type SharedConcertRecord,
  type ConcertSignupRecord,
  type ConcertSignupRefRecord,
} from "./keys";
import { pointerKeysForConcert } from "./audienceWrite";
import { toPublicConcert, type PublicSharedConcert } from "./parse";

export type ConcertListPage = {
  items: PublicSharedConcert[];
  hasMore: boolean;
  /** Opaque cursor for next page (`before` query param). */
  nextBefore: string | null;
};

const DELETE_BATCH_SIZE = 25;
const BATCH_DELETE_MAX_ATTEMPTS = 8;
/** DynamoDB BatchGetItem hard limit. */
const BATCH_GET_MAX_KEYS = 100;
const BATCH_GET_MAX_ATTEMPTS = 8;

/** List overview fields only — omit description (fetched via GetItem on detail). */
const LIST_PROJECTION_EXPRESSION =
  "concertId, title, concertDate, #location, createdAt, signupCount, #version, GSI1SK, #status, #type, #scope, targets";

const LIST_PROJECTION_NAMES = {
  "#location": "location",
  "#status": "status",
  "#type": "type",
  "#version": "version",
  "#scope": "scope",
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type BatchWriteRequestItems = NonNullable<
  BatchWriteCommand["input"]["RequestItems"]
>;

export async function getSharedConcert(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  concertId: string
): Promise<SharedConcertRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: sharedConcertPk(concertId),
        SK: sharedConcertMetaSk(),
      },
    })
  );
  const item = result.Item;
  if (!item || item.type !== "SharedConcert" || !isSharedConcertVisible(item)) {
    return null;
  }
  return item as SharedConcertRecord;
}

/**
 * Resolve the viewer's signup row.
 *
 * Prefer SIGNUPREF → chronological SIGNUP#${createdAt}#${userUuid}.
 * Legacy rows used SK = SIGNUP#${userUuid} without a SIGNUPREF — fall back to
 * that Get so viewerIsSignedUp stays correct until migration backfills refs.
 * Do not assume every ConcertSignup has a matching SIGNUPREF.
 */
export async function getViewerSignup(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  concertId: string,
  userUuid: string
): Promise<ConcertSignupRecord | null> {
  const pk = sharedConcertPk(concertId);

  const refResult = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: pk,
        SK: concertSignupRefSk(userUuid),
      },
    })
  );
  const ref = refResult.Item;
  if (ref && ref.type === "ConcertSignupRef") {
    const signupSk =
      typeof ref.signupSk === "string" && ref.signupSk.trim()
        ? ref.signupSk.trim()
        : null;
    if (signupSk) {
      const signupResult = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: pk, SK: signupSk },
        })
      );
      const signup = signupResult.Item;
      if (signup && signup.type === "ConcertSignup") {
        return signup as ConcertSignupRecord;
      }
    }
  }

  // Legacy pre-migration shape: SIGNUP#${userUuid} (no createdAt, no SIGNUPREF).
  const legacyResult = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: pk,
        SK: legacyConcertSignupSk(userUuid),
      },
    })
  );
  const legacy = legacyResult.Item;
  if (!legacy || legacy.type !== "ConcertSignup") return null;
  return legacy as ConcertSignupRecord;
}

/**
 * Batch-resolve which concerts the viewer has signed up for (SIGNUPREF + legacy SIGNUP).
 * One BatchGet sweep instead of N GetItem round-trips from the client.
 */
async function resolveViewerSignedUpConcertIds(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  concertIds: string[],
  userUuid: string
): Promise<Set<string>> {
  const signedUp = new Set<string>();
  if (!userUuid || concertIds.length === 0) return signedUp;

  const keys = concertIds.flatMap((concertId) => [
    { PK: sharedConcertPk(concertId), SK: concertSignupRefSk(userUuid) },
    { PK: sharedConcertPk(concertId), SK: legacyConcertSignupSk(userUuid) },
  ]);

  for (let i = 0; i < keys.length; i += BATCH_GET_MAX_KEYS) {
    let pending = keys.slice(i, i + BATCH_GET_MAX_KEYS);
    let attempt = 0;

    while (pending.length > 0) {
      if (attempt >= BATCH_GET_MAX_ATTEMPTS) {
        throw new Error(
          `resolveViewerSignedUpConcertIds: ${pending.length} UnprocessedKeys remain after ${BATCH_GET_MAX_ATTEMPTS} attempts (table=${tableName}).`
        );
      }

      if (attempt > 0) {
        const baseMs = 50 * 2 ** (attempt - 1);
        const jitter = Math.floor(Math.random() * baseMs * 0.5);
        await sleep(baseMs + jitter);
      }

      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: pending,
              ProjectionExpression: "concertId, #type",
              ExpressionAttributeNames: { "#type": "type" },
            },
          },
        })
      );

      for (const item of result.Responses?.[tableName] ?? []) {
        if (
          (item.type === "ConcertSignupRef" || item.type === "ConcertSignup") &&
          typeof item.concertId === "string" &&
          item.concertId.trim()
        ) {
          signedUp.add(item.concertId.trim());
        }
      }

      const unprocessed = result.UnprocessedKeys?.[tableName]?.Keys;
      pending = Array.isArray(unprocessed)
        ? (unprocessed as Array<{ PK: string; SK: string }>)
        : [];
      attempt += 1;
    }
  }

  return signedUp;
}

/**
 * List shared concerts newest-first via year-sharded GSI1 partitions.
 * Queries current+1 … lookback years (and legacy unsharded PK) in parallel,
 * merges by GSI1SK, applies `before` cursor. Omits description via ProjectionExpression.
 * When `viewerUuid` is set, enriches each item with `viewerIsSignedUp` via BatchGet.
 */
export async function listSharedConcertsPage(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  options?: {
    limit?: unknown;
    beforeGsi1Sk?: string | null;
    viewerUuid?: string | null;
  }
): Promise<ConcertListPage> {
  const limit = clampListLimit(options?.limit);
  const before = options?.beforeGsi1Sk?.trim() || null;
  const fetchLimit = limit + 1;
  const viewerUuid = options?.viewerUuid?.trim() || null;

  const currentYear = Number(todayInStockholm().slice(0, 4));
  const startYear = before
    ? (yearFromGsi1Sk(before) ?? currentYear + 1)
    : currentYear + 1;
  const minYear = currentYear - LIST_SHARD_LOOKBACK_YEARS;

  const shardPks: string[] = [];
  for (let year = startYear; year >= minYear; year -= 1) {
    shardPks.push(listGsi1PkForYear(year));
  }
  // Pre-shard rows remain listable until rewritten onto year partitions.
  shardPks.push(LIST_GSI1_PK_LEGACY);

  const shardPages = await Promise.all(
    shardPks.map((gsi1Pk) =>
      queryConcertListShard(docClient, tableName, gsi1Pk, {
        beforeGsi1Sk: before,
        limit: fetchLimit,
      })
    )
  );

  const byId = new Map<string, SharedConcertRecord>();
  for (const page of shardPages) {
    for (const row of page) {
      if (!row.concertId) continue;
      byId.set(String(row.concertId), row);
    }
  }

  let rows = Array.from(byId.values()).sort((a, b) =>
    String(b.GSI1SK || "").localeCompare(String(a.GSI1SK || ""))
  );
  if (before) {
    rows = rows.filter((r) => String(r.GSI1SK || "") < before);
  }

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextBefore =
    hasMore && last?.GSI1SK ? String(last.GSI1SK) : null;

  const signedUpIds = viewerUuid
    ? await resolveViewerSignedUpConcertIds(
        docClient,
        tableName,
        page.map((c) => String(c.concertId)),
        viewerUuid
      )
    : null;

  return {
    items: page.map((c) => {
      const pub = toPublicConcert(
        c,
        isConcertOpenForSignup(String(c.concertDate))
      );
      if (!signedUpIds) return pub;
      return {
        ...pub,
        viewerIsSignedUp: signedUpIds.has(String(c.concertId)),
      };
    }),
    hasMore,
    nextBefore,
  };
}

async function queryConcertListShard(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  gsi1Pk: string,
  options: { beforeGsi1Sk?: string | null; limit: number }
): Promise<SharedConcertRecord[]> {
  const values: Record<string, string> = { ":pk": gsi1Pk };
  let keyCondition = "GSI1PK = :pk";
  if (options.beforeGsi1Sk) {
    keyCondition = "GSI1PK = :pk AND GSI1SK < :before";
    values[":before"] = options.beforeGsi1Sk;
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: { ...LIST_PROJECTION_NAMES },
      ProjectionExpression: LIST_PROJECTION_EXPRESSION,
      ScanIndexForward: false,
      Limit: options.limit,
    })
  );

  const rows: SharedConcertRecord[] = [];
  for (const item of result.Items ?? []) {
    if (item.type !== "SharedConcert" || !isSharedConcertVisible(item)) continue;
    rows.push(item as SharedConcertRecord);
  }
  return rows;
}

export type SignupListPage = {
  items: ConcertSignupRecord[];
  hasMore: boolean;
  nextBeforeSk: string | null;
};

export async function listSignupsPage(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  concertId: string,
  options?: { limit?: unknown; beforeSk?: string | null }
): Promise<SignupListPage> {
  const limit = clampListLimit(options?.limit);
  const beforeSk = options?.beforeSk?.trim() || null;
  const fetchLimit = limit + 1;
  const pk = sharedConcertPk(concertId);

  const values: Record<string, string> = {
    ":pk": pk,
    ":skStart": SIGNUP_SK_PREFIX,
  };
  let keyCondition = "PK = :pk AND begins_with(SK, :skStart)";
  if (beforeSk) {
    keyCondition = "PK = :pk AND SK BETWEEN :skStart AND :skEnd";
    values[":skEnd"] = beforeSk;
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: values,
      ScanIndexForward: false,
      Limit: fetchLimit,
    })
  );

  const rows: ConcertSignupRecord[] = [];
  for (const item of result.Items ?? []) {
    if (item.type !== "ConcertSignup") continue;
    if (beforeSk && item.SK === beforeSk) continue;
    rows.push(item as ConcertSignupRecord);
  }

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  return {
    items: page,
    hasMore,
    nextBeforeSk: hasMore && last?.SK ? String(last.SK) : null,
  };
}

export async function getChoirDisplayName(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  choirSlug: string
): Promise<string | undefined> {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `GROUP#${choirSlug}`, SK: "METADATA" },
    })
  );
  const name = result.Item?.name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

type ConcertChildKey = { PK: string; SK: string };

/** All signup + ref rows under a concert (paginated Query, no Scan). */
export async function listAllConcertSignupChildKeys(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  concertId: string
): Promise<ConcertChildKey[]> {
  const pk = sharedConcertPk(concertId);
  const keys: ConcertChildKey[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression:
          "PK = :pk AND SK BETWEEN :skStart AND :skEnd",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":skStart": SIGNUP_SK_PREFIX,
          ":skEnd": SIGNUP_CHILD_SK_END,
        },
        ProjectionExpression: "PK, SK",
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    for (const item of result.Items ?? []) {
      if (typeof item.PK !== "string" || typeof item.SK !== "string") continue;
      keys.push({ PK: item.PK, SK: item.SK });
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return keys;
}

function countUnprocessed(
  requestItems: BatchWriteRequestItems | undefined
): number {
  if (!requestItems) return 0;
  return Object.values(requestItems).reduce(
    (sum, writes) => sum + (writes?.length ?? 0),
    0
  );
}

/**
 * Batch-delete keys with exponential backoff + jitter on UnprocessedItems.
 * Fails loud after BATCH_DELETE_MAX_ATTEMPTS so callers do not leave orphans.
 */
async function batchDeleteKeys(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  keys: ConcertChildKey[]
): Promise<void> {
  for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
    const chunk = keys.slice(i, i + DELETE_BATCH_SIZE);
    let pending: BatchWriteRequestItems | undefined = {
      [tableName]: chunk.map((key) => ({
        DeleteRequest: { Key: key },
      })),
    };

    let attempt = 0;
    while (pending && countUnprocessed(pending) > 0) {
      if (attempt >= BATCH_DELETE_MAX_ATTEMPTS) {
        throw new Error(
          `batchDeleteKeys: ${countUnprocessed(pending)} UnprocessedItems remain after ${BATCH_DELETE_MAX_ATTEMPTS} attempts (table=${tableName}).`
        );
      }

      if (attempt > 0) {
        const baseMs = 50 * 2 ** (attempt - 1);
        const jitter = Math.floor(Math.random() * baseMs * 0.5);
        await sleep(baseMs + jitter);
      }

      const result = await docClient.send(
        new BatchWriteCommand({ RequestItems: pending })
      );
      const unprocessed = result.UnprocessedItems as
        | BatchWriteRequestItems
        | undefined;
      if (!unprocessed || countUnprocessed(unprocessed) === 0) {
        pending = undefined;
        break;
      }
      pending = unprocessed;
      attempt += 1;
    }
  }
}

type TombstoneResult = "marked" | "already" | "missing";

async function markConcertDeleting(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  concertId: string
): Promise<TombstoneResult> {
  const pk = sharedConcertPk(concertId);
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: pk, SK: sharedConcertMetaSk() },
        UpdateExpression: "SET #status = :deleting",
        ConditionExpression:
          "attribute_exists(PK) AND #type = :concertType AND (attribute_not_exists(#status) OR #status <> :deleting)",
        ExpressionAttributeNames: {
          "#type": "type",
          "#status": "status",
        },
        ExpressionAttributeValues: {
          ":deleting": "deleting",
          ":concertType": "SharedConcert",
        },
      })
    );
    return "marked";
  } catch (err) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    if (name !== "ConditionalCheckFailedException") throw err;

    const existing = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK: pk, SK: sharedConcertMetaSk() },
      })
    );
    const item = existing.Item;
    if (!item || item.type !== "SharedConcert") return "missing";
    if (item.status === "deleting") return "already";
    return "missing";
  }
}

/**
 * Tombstone META (status=deleting), delete all signup/ref children, then META.
 * Prevents new signups during cleanup via atomic META conditions in createSignup.
 */
/**
 * Choir feed: thin pointers under GROUP#{slug} and GROUP#ALL, plus legacy
 * META rows that have no scope (still visible to every choir). No Scan.
 */
export async function listSharedConcertsForChoir(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  groupSlug: string,
  options?: {
    limit?: unknown;
    beforeGsi1Sk?: string | null;
    viewerUuid?: string | null;
  }
): Promise<ConcertListPage> {
  const limit = clampListLimit(options?.limit);
  const before = options?.beforeGsi1Sk?.trim() || null;
  const fetchLimit = limit + 1;
  const viewerUuid = options?.viewerUuid?.trim() || null;

  const [choirIds, allIds, legacyRows] = await Promise.all([
    queryAudienceConcertIds(docClient, tableName, groupAudiencePk(groupSlug), {
      before,
      limit: fetchLimit,
    }),
    queryAudienceConcertIds(
      docClient,
      tableName,
      groupAudiencePk(ALL_AUDIENCE_TARGET),
      { before, limit: fetchLimit }
    ),
    queryLegacyConcerts(docClient, tableName, { before, limit: fetchLimit }),
  ]);

  const pointerIds = Array.from(new Set([...choirIds.ids, ...allIds.ids]));
  const pointed = await batchGetConcerts(docClient, tableName, pointerIds);
  const visiblePointed = pointed.filter(
    (row) =>
      isSharedConcertVisible(row) &&
      concertVisibleToChoir(row, groupSlug) &&
      (!before || String(row.GSI1SK || "") < before)
  );

  const byId = new Map<string, SharedConcertRecord>();
  for (const row of [...visiblePointed, ...legacyRows]) {
    if (!row.concertId || !isSharedConcertVisible(row)) continue;
    if (!concertVisibleToChoir(row, groupSlug)) continue;
    byId.set(String(row.concertId), row);
  }

  let rows = Array.from(byId.values()).sort((a, b) =>
    String(b.GSI1SK || "").localeCompare(String(a.GSI1SK || ""))
  );
  if (before) {
    rows = rows.filter((row) => String(row.GSI1SK || "") < before);
  }

  const hasMore =
    rows.length > limit || choirIds.truncated || allIds.truncated || legacyRows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextBefore = hasMore && last?.GSI1SK ? String(last.GSI1SK) : null;

  const signedUpIds = viewerUuid
    ? await resolveViewerSignedUpConcertIds(
        docClient,
        tableName,
        page.map((concert) => String(concert.concertId)),
        viewerUuid
      )
    : null;

  return {
    items: page.map((concert) => {
      const pub = toPublicConcert(
        concert,
        isConcertOpenForSignup(String(concert.concertDate))
      );
      if (!signedUpIds) return pub;
      return {
        ...pub,
        viewerIsSignedUp: signedUpIds.has(String(concert.concertId)),
      };
    }),
    hasMore,
    nextBefore,
  };
}

async function queryAudienceConcertIds(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  pk: string,
  options: { before: string | null; limit: number }
): Promise<{ ids: string[]; truncated: boolean }> {
  const values: Record<string, string> = {
    ":pk": pk,
    ":skStart": SHARED_CONCERT_REF_SK_PREFIX,
  };
  let keyCondition = "PK = :pk AND begins_with(SK, :skStart)";
  const cursorSk = options.before
    ? `${SHARED_CONCERT_REF_SK_PREFIX}${options.before}`
    : null;
  if (cursorSk) {
    keyCondition = "PK = :pk AND SK BETWEEN :skStart AND :skEnd";
    values[":skEnd"] = cursorSk;
  }

  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: values,
      ProjectionExpression: "concertId, SK",
      ScanIndexForward: false,
      Limit: options.limit + (cursorSk ? 1 : 0),
    })
  );

  const ids: string[] = [];
  for (const item of result.Items ?? []) {
    if (cursorSk && String(item.SK) >= cursorSk) continue;
    const concertId =
      typeof item.concertId === "string" && item.concertId.trim()
        ? item.concertId.trim()
        : concertIdFromRefSk(typeof item.SK === "string" ? item.SK : "");
    if (concertId) ids.push(concertId);
  }

  return { ids, truncated: Boolean(result.LastEvaluatedKey) };
}

function concertIdFromRefSk(sk: string): string | null {
  if (!sk.startsWith(SHARED_CONCERT_REF_SK_PREFIX)) return null;
  const rest = sk.slice(SHARED_CONCERT_REF_SK_PREFIX.length);
  const hash = rest.indexOf("#");
  if (hash < 0) return null;
  const id = rest.slice(hash + 1).trim();
  return id || null;
}

async function queryLegacyConcerts(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  options: { before: string | null; limit: number }
): Promise<SharedConcertRecord[]> {
  const currentYear = Number(todayInStockholm().slice(0, 4));
  const startYear = options.before
    ? (yearFromGsi1Sk(options.before) ?? currentYear + 1)
    : currentYear + 1;
  const minYear = currentYear - LIST_SHARD_LOOKBACK_YEARS;
  const shardPks: string[] = [];
  for (let year = startYear; year >= minYear; year -= 1) {
    shardPks.push(listGsi1PkForYear(year));
  }
  shardPks.push(LIST_GSI1_PK_LEGACY);

  const collected: SharedConcertRecord[] = [];
  for (const gsi1Pk of shardPks) {
    if (collected.length >= options.limit) break;
    const rows = await queryLegacyShard(docClient, tableName, gsi1Pk, {
      before: options.before,
      limit: options.limit - collected.length,
    });
    collected.push(...rows);
  }

  return collected.filter(
    (row) => row.scope !== "all" && row.scope !== "groups"
  );
}

async function queryLegacyShard(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  gsi1Pk: string,
  options: { before: string | null; limit: number }
): Promise<SharedConcertRecord[]> {
  const rows: SharedConcertRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let pages = 0;

  while (rows.length < options.limit && pages < 6) {
    const values: Record<string, string> = {
      ":pk": gsi1Pk,
      ":concertType": "SharedConcert",
    };
    let keyCondition = "GSI1PK = :pk";
    if (options.before) {
      keyCondition = "GSI1PK = :pk AND GSI1SK < :before";
      values[":before"] = options.before;
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "GSI1",
        KeyConditionExpression: keyCondition,
        FilterExpression:
          "attribute_not_exists(#scope) AND #type = :concertType AND (attribute_not_exists(#status) OR #status <> :deleting)",
        ExpressionAttributeValues: { ...values, ":deleting": "deleting" },
        ExpressionAttributeNames: { ...LIST_PROJECTION_NAMES },
        ProjectionExpression: LIST_PROJECTION_EXPRESSION,
        ScanIndexForward: false,
        Limit: Math.max(options.limit, 25),
        ExclusiveStartKey: exclusiveStartKey,
      })
    );
    pages += 1;

    for (const item of result.Items ?? []) {
      if (item.type !== "SharedConcert" || !isSharedConcertVisible(item)) continue;
      if (item.scope === "all" || item.scope === "groups") continue;
      rows.push(item as SharedConcertRecord);
      if (rows.length >= options.limit) break;
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
    if (!exclusiveStartKey) break;
  }

  return rows;
}

async function batchGetConcerts(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  concertIds: string[]
): Promise<SharedConcertRecord[]> {
  const unique = Array.from(new Set(concertIds.filter(Boolean)));
  const found: SharedConcertRecord[] = [];

  for (let i = 0; i < unique.length; i += BATCH_GET_MAX_KEYS) {
    let pending: Array<{ PK: string; SK: string }> = unique
      .slice(i, i + BATCH_GET_MAX_KEYS)
      .map((concertId) => ({
        PK: sharedConcertPk(concertId),
        SK: sharedConcertMetaSk(),
      }));
    let attempt = 0;

    while (pending.length > 0) {
      if (attempt >= BATCH_GET_MAX_ATTEMPTS) {
        throw new Error(
          `batchGetConcerts: ${pending.length} UnprocessedKeys remain after ${BATCH_GET_MAX_ATTEMPTS} attempts (table=${tableName}).`
        );
      }
      if (attempt > 0) {
        const baseMs = 50 * 2 ** (attempt - 1);
        const jitter = Math.floor(Math.random() * baseMs * 0.5);
        await sleep(baseMs + jitter);
      }

      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: pending,
              ProjectionExpression: LIST_PROJECTION_EXPRESSION,
              ExpressionAttributeNames: { ...LIST_PROJECTION_NAMES },
            },
          },
        })
      );

      for (const item of result.Responses?.[tableName] ?? []) {
        if (item.type === "SharedConcert") found.push(item as SharedConcertRecord);
      }

      const unprocessed = result.UnprocessedKeys?.[tableName]?.Keys;
      pending = Array.isArray(unprocessed)
        ? (unprocessed as Array<{ PK: string; SK: string }>)
        : [];
      attempt += 1;
    }
  }

  return found;
}

export async function deleteSharedConcertCascade(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  concertId: string
): Promise<{ deletedSignupCount: number } | null> {
  const existing = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: {
        PK: sharedConcertPk(concertId),
        SK: sharedConcertMetaSk(),
      },
    })
  );
  const meta = existing.Item;
  if (!meta || meta.type !== "SharedConcert") return null;

  const pointerKeys = pointerKeysForConcert({
    concertId,
    concertDate: String(meta.concertDate ?? ""),
    scope: typeof meta.scope === "string" ? meta.scope : undefined,
    targets: Array.isArray(meta.targets) ? meta.targets.map(String) : undefined,
  });

  const tombstone = await markConcertDeleting(docClient, tableName, concertId);
  if (tombstone === "missing") return null;

  const childKeys = await listAllConcertSignupChildKeys(
    docClient,
    tableName,
    concertId
  );
  const signupCount = childKeys.filter((k) =>
    k.SK.startsWith(SIGNUP_SK_PREFIX)
  ).length;

  if (childKeys.length > 0) {
    await batchDeleteKeys(docClient, tableName, childKeys);
  }
  if (pointerKeys.length > 0) {
    await batchDeleteKeys(docClient, tableName, pointerKeys);
  }

  const pk = sharedConcertPk(concertId);
  try {
    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { PK: pk, SK: sharedConcertMetaSk() },
        ConditionExpression: "#status = :deleting",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":deleting": "deleting" },
      })
    );
  } catch (err) {
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    if (name === "ConditionalCheckFailedException") {
      const existing = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: pk, SK: sharedConcertMetaSk() },
        })
      );
      if (!existing.Item) {
        return { deletedSignupCount: signupCount };
      }
    }
    throw err;
  }

  return { deletedSignupCount: signupCount };
}

export type { ConcertSignupRefRecord };
