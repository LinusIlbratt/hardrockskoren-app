import type { AttributeType } from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { cognito } from "../../../core/services/cognito";
import { getUserDetailsFromAttributes } from "../../../core/utils/authHelper";
import type { AuthContext } from "../../../core/types";
import { messageCanonicalPk } from "./keys";

export type SenderNameFields = {
  messageId?: string;
  createdByUuid?: string;
  createdByName?: string;
  createdByGivenName?: string;
};

export type ResolvedSenderName = {
  createdByName?: string;
  createdByGivenName?: string;
};

export function hasStoredSenderName(item: SenderNameFields): boolean {
  const given =
    typeof item.createdByGivenName === "string"
      ? item.createdByGivenName.trim()
      : "";
  if (given.length > 0) return true;

  const full =
    typeof item.createdByName === "string" ? item.createdByName.trim() : "";
  return full.length > 0;
}

export function buildSenderName(
  givenName?: string,
  familyName?: string
): ResolvedSenderName {
  const given = typeof givenName === "string" ? givenName.trim() : "";
  const family = typeof familyName === "string" ? familyName.trim() : "";
  const full = [given, family].filter(Boolean).join(" ").trim();

  if (!given && !full) {
    return {};
  }

  return {
    ...(given ? { createdByGivenName: given } : {}),
    ...(full ? { createdByName: full } : given ? { createdByName: given } : {}),
  };
}

export function namesFromUserAttributes(
  userAttributes?: AttributeType[]
): ResolvedSenderName {
  const { given_name, family_name } =
    getUserDetailsFromAttributes(userAttributes);
  return buildSenderName(given_name, family_name);
}

export function namesFromAuthContext(
  auth?: AuthContext | null
): ResolvedSenderName {
  if (!auth) return {};
  return buildSenderName(auth.given_name, auth.family_name);
}

export function applyResolvedSenderName<T extends SenderNameFields>(
  item: T,
  resolved?: ResolvedSenderName | null
): T {
  if (!resolved || hasStoredSenderName(item)) {
    return item;
  }
  return {
    ...item,
    ...(resolved.createdByGivenName
      ? { createdByGivenName: resolved.createdByGivenName }
      : {}),
    ...(resolved.createdByName ? { createdByName: resolved.createdByName } : {}),
  };
}

export async function lookupSenderNamesByUuid(
  userPoolId: string,
  uuids: string[]
): Promise<Map<string, ResolvedSenderName>> {
  const unique = Array.from(
    new Set(uuids.map((id) => id.trim()).filter(Boolean))
  );
  const map = new Map<string, ResolvedSenderName>();

  await Promise.all(
    unique.map(async (uuid) => {
      try {
        const { UserAttributes } = await cognito.adminGetUser({
          UserPoolId: userPoolId,
          Username: uuid,
        });
        const names = namesFromUserAttributes(UserAttributes);
        if (names.createdByGivenName || names.createdByName) {
          map.set(uuid, names);
        }
      } catch (err) {
        console.warn("lookupSenderNamesByUuid failed", { uuid, err });
      }
    })
  );

  return map;
}

export async function resolveCreatorNames(
  auth: AuthContext | undefined,
  uuid: string,
  userPoolId: string
): Promise<ResolvedSenderName> {
  const fromAuth = namesFromAuthContext(auth);
  if (fromAuth.createdByGivenName || fromAuth.createdByName) {
    return fromAuth;
  }

  const lookedUp = await lookupSenderNamesByUuid(userPoolId, [uuid]);
  return lookedUp.get(uuid.trim()) ?? {};
}

/**
 * Fills missing sender names from Cognito (by createdByUuid) and optionally
 * backfills canonical MessageCanonical rows so later reads stay cheap.
 */
export async function enrichItemsWithSenderNames<T extends SenderNameFields>(
  items: T[],
  options: {
    userPoolId: string;
    docClient?: DynamoDBDocumentClient;
    tableName?: string;
  }
): Promise<T[]> {
  const missingUuids = new Set<string>();
  for (const item of items) {
    if (hasStoredSenderName(item)) continue;
    const uuid =
      typeof item.createdByUuid === "string" ? item.createdByUuid.trim() : "";
    if (uuid) missingUuids.add(uuid);
  }

  if (missingUuids.size === 0) {
    return items;
  }

  const namesByUuid = await lookupSenderNamesByUuid(
    options.userPoolId,
    [...missingUuids]
  );

  const enriched = items.map((item) => {
    if (hasStoredSenderName(item)) return item;
    const uuid =
      typeof item.createdByUuid === "string" ? item.createdByUuid.trim() : "";
    if (!uuid) return item;
    return applyResolvedSenderName(item, namesByUuid.get(uuid));
  });

  if (options.docClient && options.tableName) {
    const backfillCandidates = enriched.filter((item, index) => {
      if (!hasStoredSenderName(item)) return false;
      return !hasStoredSenderName(items[index]!);
    });
    await backfillCanonicalSenderNames(
      options.docClient,
      options.tableName,
      backfillCandidates
    );
  }

  return enriched;
}

export async function backfillCanonicalSenderNames(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  items: SenderNameFields[]
): Promise<void> {
  const candidates = items.filter(
    (item) =>
      typeof item.messageId === "string" &&
      item.messageId.trim().length > 0 &&
      hasStoredSenderName(item)
  );

  await Promise.all(
    candidates.map(async (item) => {
      const messageId = item.messageId!.trim();
      const given = item.createdByGivenName?.trim();
      const full = item.createdByName?.trim();

      const values: Record<string, string> = {};
      const setParts: string[] = [];

      if (given) {
        values[":given"] = given;
        setParts.push("createdByGivenName = :given");
      }
      if (full) {
        values[":full"] = full;
        setParts.push("createdByName = :full");
      }
      if (setParts.length === 0) return;

      try {
        await docClient.send(
          new UpdateCommand({
            TableName: tableName,
            Key: { PK: messageCanonicalPk(messageId), SK: "META" },
            UpdateExpression: `SET ${setParts.join(", ")}`,
            ConditionExpression:
              "#type = :canonical AND attribute_not_exists(createdByName) AND attribute_not_exists(createdByGivenName)",
            ExpressionAttributeNames: { "#type": "type" },
            ExpressionAttributeValues: {
              ...values,
              ":canonical": "MessageCanonical",
            },
          })
        );
      } catch (err) {
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name: unknown }).name)
            : "";
        if (name !== "ConditionalCheckFailedException") {
          console.warn("backfillCanonicalSenderNames failed", { messageId, err });
        }
      }
    })
  );
}
