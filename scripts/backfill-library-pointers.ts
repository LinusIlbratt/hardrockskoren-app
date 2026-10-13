/**
 * Engångsbackfill: skriv saknade bibliotekspekare för repertoarer vars titel
 * är en biblioteksmapp.
 *
 * Detta är ett migreringsskript, inte en API-väg. Det scannar huvudtabellen
 * en gång (samma uppslag som den äldre mapp-synken) och skriver bara pekare
 * som saknas.
 *
 *   npm run backfill:library-pointers -- --stage dev --dry-run
 *   npm run backfill:library-pointers -- --stage dev
 *
 * Använder AWS standardkedja för credentials. Region är eu-north-1 om
 * AWS_REGION inte är satt.
 */
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  ScanCommand,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import {
  isSafeToken,
  libraryFolderPointerKey,
  normalizeFolderPath,
} from "../packages/material-api/functions/lib/libraryFolderKeys";

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-north-1";

type Args = {
  stage: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  let stage = "";
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--stage") {
      stage = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run backfill:library-pointers -- --stage <dev|prod> [--dry-run]");
      process.exit(0);
    }
    throw new Error(`Okänt argument: ${arg}`);
  }
  if (!/^[a-z0-9-]+$/.test(stage)) {
    throw new Error("Ange --stage dev eller --stage prod.");
  }
  return { stage, dryRun };
}

type RepertoireRow = {
  groupSlug: string;
  repertoireId: string;
  title: string;
};

function repertoireFromItem(raw: Record<string, AttributeValue>): RepertoireRow | null {
  const item = unmarshall(raw) as {
    PK?: string;
    SK?: string;
    repertoireId?: string;
    title?: string;
  };
  const pk = (item.PK || "").trim();
  const sk = (item.SK || "").trim();
  if (!pk.startsWith("GROUP#") || !sk.startsWith("REPERTOIRE#")) return null;
  if (sk.includes("#MATERIAL#")) return null;
  const groupSlug = pk.slice("GROUP#".length).trim();
  const fromSk = sk.slice("REPERTOIRE#".length).trim();
  const repertoireId = (item.repertoireId || fromSk).trim();
  const title = (item.title || "").trim();
  if (!groupSlug || !repertoireId || repertoireId.includes("#") || !isSafeToken(repertoireId, 80)) {
    return null;
  }
  if (!title) return null;
  return { groupSlug, repertoireId, title };
}

async function scanRepertoires(
  client: DynamoDBClient,
  tableName: string
): Promise<RepertoireRow[]> {
  const rows: RepertoireRow[] = [];
  let startKey: Record<string, AttributeValue> | undefined;
  do {
    const page = await client.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "#type = :type AND begins_with(PK, :pk) AND begins_with(SK, :sk)",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: {
          ":type": { S: "Repertoire" },
          ":pk": { S: "GROUP#" },
          ":sk": { S: "REPERTOIRE#" },
        },
        ProjectionExpression: "PK, SK, repertoireId, title",
        ExclusiveStartKey: startKey,
      })
    );
    for (const item of page.Items ?? []) {
      const row = repertoireFromItem(item);
      if (row) rows.push(row);
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  return rows;
}

async function folderHasLibraryFiles(
  client: DynamoDBClient,
  tableName: string,
  folderPath: string
): Promise<boolean> {
  const page = await client.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI1PK = :gsi1pk AND begins_with(filePath, :prefix)",
      ExpressionAttributeValues: {
        ":gsi1pk": { S: "MATERIALS" },
        ":prefix": { S: `${folderPath}/` },
      },
      ProjectionExpression: "materialId",
      Limit: 1,
    })
  );
  return (page.Items?.length ?? 0) > 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tableName = `HrkMainTable-${args.stage}`;
  const client = new DynamoDBClient({ region: REGION });

  console.log(
    `${args.dryRun ? "Torrkörning" : "Skriver pekare"} mot ${tableName} (${REGION}).`
  );

  const repertoires = await scanRepertoires(client, tableName);
  console.log(`Hittade ${repertoires.length} repertoarrubriker.`);

  let written = 0;
  let alreadyPresent = 0;
  let notLibrary = 0;
  let invalidTitle = 0;
  let conflicts = 0;

  for (const row of repertoires) {
    const folderPath = normalizeFolderPath(row.title);
    if (!folderPath) {
      invalidTitle += 1;
      console.log(`hoppar över  ${row.groupSlug} / ${row.repertoireId} — titel kan inte vara en mappsökväg`);
      continue;
    }

    const hasFiles = await folderHasLibraryFiles(client, tableName, folderPath);
    if (!hasFiles) {
      notLibrary += 1;
      continue;
    }

    const key = libraryFolderPointerKey(folderPath, row.groupSlug);
    const existing = await client.send(
      new GetItemCommand({
        TableName: tableName,
        Key: marshall(key),
        ProjectionExpression: "repertoireId",
      })
    );
    const existingRow = existing.Item
      ? (unmarshall(existing.Item) as { repertoireId?: string })
      : null;
    const existingId =
      typeof existingRow?.repertoireId === "string" ? existingRow.repertoireId.trim() : "";

    if (existingId && existingId !== row.repertoireId) {
      conflicts += 1;
      console.log(
        `konflikt    ${key.PK} / ${key.SK} har repertoireId=${existingId}, lämnar den (skannad ${row.repertoireId})`
      );
      continue;
    }
    if (existingId === row.repertoireId) {
      alreadyPresent += 1;
      continue;
    }

    console.log(
      `${args.dryRun ? "skulle skriva" : "skriver"}  ${key.PK} / ${key.SK}  repertoireId=${row.repertoireId}`
    );
    if (!args.dryRun) {
      try {
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: marshall({
              ...key,
              repertoireId: row.repertoireId,
              type: "LibraryFolderChoir",
            }),
            ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
          })
        );
      } catch (error: unknown) {
        const name = error instanceof Error ? error.name : "";
        if (name === "ConditionalCheckFailedException") {
          alreadyPresent += 1;
          console.log(`fanns redan  ${key.PK} / ${key.SK}`);
          continue;
        }
        throw error;
      }
    }
    written += 1;
  }

  console.log(
    [
      `Klart.`,
      `${args.dryRun ? "skulle skriva" : "skrivna"}=${written}`,
      `fanns=${alreadyPresent}`,
      `inte biblioteksmapp=${notLibrary}`,
      `ogiltig titel=${invalidTitle}`,
      `konflikter=${conflicts}`,
    ].join(" ")
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Backfill misslyckades.";
  console.error(message);
  process.exit(1);
});
