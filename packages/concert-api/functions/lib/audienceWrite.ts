import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import {
  ALL_AUDIENCE_TARGET,
  groupAudiencePk,
  sharedConcertRefSk,
  type ConcertAudienceScope,
} from "./keys";

const TRANSACT_LIMIT = 100;

type TransactItem = NonNullable<TransactWriteCommandInput["TransactItems"]>[number];

export type AudiencePointerKey = { PK: string; SK: string };

export function audienceTargetsFor(
  scope: ConcertAudienceScope | undefined,
  targets: string[] | undefined
): string[] {
  if (scope !== "all" && scope !== "groups") return [];
  if (scope === "all") return [ALL_AUDIENCE_TARGET];
  return (targets ?? []).filter((slug) => slug && slug !== ALL_AUDIENCE_TARGET);
}

export function pointerKey(
  groupSlug: string,
  concertDate: string,
  concertId: string
): AudiencePointerKey {
  return {
    PK: groupAudiencePk(groupSlug),
    SK: sharedConcertRefSk(concertDate, concertId),
  };
}

export function pointerKeysForConcert(record: {
  concertId: string;
  concertDate: string;
  scope?: ConcertAudienceScope | string;
  targets?: string[];
}): AudiencePointerKey[] {
  const scope =
    record.scope === "all" || record.scope === "groups" ? record.scope : undefined;
  return audienceTargetsFor(scope, record.targets).map((slug) =>
    pointerKey(slug, record.concertDate, record.concertId)
  );
}

export function pointerItem(
  tableName: string,
  groupSlug: string,
  concertDate: string,
  concertId: string
): TransactItem {
  const key = pointerKey(groupSlug, concertDate, concertId);
  return {
    Put: {
      TableName: tableName,
      Item: {
        ...key,
        type: "SharedConcertRef",
        concertId,
        concertDate,
        groupSlug,
      },
    },
  };
}

function keyId(key: AudiencePointerKey): string {
  return `${key.PK}\u0000${key.SK}`;
}

/** Deletes pointers that moved and writes the new ones. Skips keys that stay put. */
export function pointerRewriteItems(
  tableName: string,
  concertId: string,
  from: { concertDate: string; scope?: ConcertAudienceScope | string; targets?: string[] },
  to: { concertDate: string; scope: ConcertAudienceScope; targets: string[] }
): TransactItem[] {
  const oldKeys = pointerKeysForConcert({ concertId, ...from });
  const newSlugs = audienceTargetsFor(to.scope, to.targets);
  const newKeys = newSlugs.map((slug) => pointerKey(slug, to.concertDate, concertId));
  const newIds = new Set(newKeys.map(keyId));
  const oldIds = new Set(oldKeys.map(keyId));

  const deletes: TransactItem[] = oldKeys
    .filter((key) => !newIds.has(keyId(key)))
    .map((key) => ({
      Delete: { TableName: tableName, Key: key },
    }));
  const puts = newSlugs
    .filter((slug) => !oldIds.has(keyId(pointerKey(slug, to.concertDate, concertId))))
    .map((slug) => pointerItem(tableName, slug, to.concertDate, concertId));

  return [...deletes, ...puts];
}

/**
 * Runs TransactWrite in chunks of 100. The last item should be the conditional
 * META write so earlier chunks are only pointer deletes (safe to retry).
 */
export async function transactInChunks(
  docClient: DynamoDBDocumentClient,
  items: TransactItem[]
): Promise<void> {
  if (items.length === 0) return;
  if (items.length <= TRANSACT_LIMIT) {
    await docClient.send(new TransactWriteCommand({ TransactItems: items }));
    return;
  }
  const head = items.slice(0, items.length - TRANSACT_LIMIT);
  const tail = items.slice(-TRANSACT_LIMIT);
  await transactInChunks(docClient, head);
  await docClient.send(new TransactWriteCommand({ TransactItems: tail }));
}
