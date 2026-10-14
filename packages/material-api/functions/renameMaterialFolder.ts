import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
  type TransactWriteItem,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendError, sendResponse } from "../../core/utils/http";
import {
  findRepertoireHeader,
  GROUP_SLUG_MAX,
  listLibraryFolderChoirs,
  queryFolderMaterialFiles,
  type LibraryFolderChoirLink,
} from "./lib/libraryFolderChoirs";
import {
  folderPathsForLibraryDelete,
  isSafeToken,
  libraryFolderPointerKey,
  normalizeFolderPath,
  type ItemKey,
} from "./lib/libraryFolderKeys";
import {
  buildRenamedFolderPath,
  folderRenameConflict,
  folderRenameLockKey,
  nextRepertoireTitle,
  parseFolderName,
  replaceFolderPrefix,
} from "./lib/renameMaterialFolder";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

const TRANSACT_CHUNK = 25;

type SourceFile = {
  materialId: string;
  filePath: string;
  nextPath: string;
};

function errorName(error: unknown): string {
  if (!error || typeof error !== "object" || !("name" in error)) return "";
  return String((error as { name?: unknown }).name ?? "");
}

function isConditionalFailure(error: unknown): boolean {
  return (
    error instanceof ConditionalCheckFailedException ||
    errorName(error) === "ConditionalCheckFailedException" ||
    errorName(error) === "TransactionCanceledException"
  );
}

async function readRenameLock(
  tableName: string,
  folderPath: string
): Promise<string | null> {
  const key = folderRenameLockKey(folderPath);
  const result = await dbClient.send(
    new GetItemCommand({
      TableName: tableName,
      Key: { PK: { S: key.PK }, SK: { S: key.SK } },
      ProjectionExpression: "newFolderPath",
    })
  );
  if (!result.Item) return null;
  const path = (unmarshall(result.Item) as { newFolderPath?: string }).newFolderPath?.trim();
  return path || null;
}

async function acquireRenameLock(
  tableName: string,
  folderPath: string,
  newFolderPath: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const key = folderRenameLockKey(folderPath);
  try {
    await dbClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall({
          ...key,
          newFolderPath,
          type: "FolderRenameLock",
        }),
        ConditionExpression: "attribute_not_exists(PK)",
      })
    );
    return { ok: true };
  } catch (error: unknown) {
    if (!isConditionalFailure(error)) throw error;
    const current = await readRenameLock(tableName, folderPath);
    if (current === newFolderPath) return { ok: true };
    if (current) {
      return {
        ok: false,
        message: `Ett namnbyte till "${current}" pågår redan för den här mappen. Spara det namnet igen för att slutföra bytet.`,
      };
    }
    throw error;
  }
}

async function releaseRenameLock(
  tableName: string,
  folderPath: string,
  newFolderPath: string
): Promise<void> {
  const key = folderRenameLockKey(folderPath);
  try {
    await dbClient.send(
      new DeleteItemCommand({
        TableName: tableName,
        Key: { PK: { S: key.PK }, SK: { S: key.SK } },
        ConditionExpression: "newFolderPath = :next",
        ExpressionAttributeValues: { ":next": { S: newFolderPath } },
      })
    );
  } catch (error: unknown) {
    if (!isConditionalFailure(error)) throw error;
  }
}

function fileUpdate(tableName: string, file: SourceFile, updatedAt: string): TransactWriteItem["Update"] {
  return {
      TableName: tableName,
      Key: {
        PK: { S: `MATERIAL#${file.materialId}` },
        SK: { S: `MATERIAL#${file.materialId}` },
      },
      UpdateExpression: "SET #filePath = :next, #updatedAt = :updatedAt",
      ConditionExpression: "attribute_exists(PK) AND #filePath = :current",
      ExpressionAttributeNames: {
        "#filePath": "filePath",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: {
        ":next": { S: file.nextPath },
        ":current": { S: file.filePath },
        ":updatedAt": { S: updatedAt },
      },
  };
}

async function readFilePath(tableName: string, materialId: string): Promise<string | null> {
  const result = await dbClient.send(
    new GetItemCommand({
      TableName: tableName,
      Key: {
        PK: { S: `MATERIAL#${materialId}` },
        SK: { S: `MATERIAL#${materialId}` },
      },
      ProjectionExpression: "filePath",
    })
  );
  if (!result.Item) return null;
  const filePath = (unmarshall(result.Item) as { filePath?: string }).filePath?.trim();
  return filePath || null;
}

async function rewriteOneFile(tableName: string, file: SourceFile, updatedAt: string): Promise<void> {
  try {
    const update = fileUpdate(tableName, file, updatedAt);
    if (!update) throw new Error("Kunde inte förbereda namnbytet.");
    await dbClient.send(new UpdateItemCommand(update));
  } catch (error: unknown) {
    if (!isConditionalFailure(error)) throw error;
    const current = await readFilePath(tableName, file.materialId);
    if (current === file.nextPath) return;
    if (current === file.filePath) {
      const retry = fileUpdate(tableName, file, updatedAt);
      if (!retry) throw new Error("Kunde inte förbereda namnbytet.");
      await dbClient.send(new UpdateItemCommand(retry));
      return;
    }
    throw new Error("En fil ändrades under namnbytet. Försök igen.");
  }
}

async function rewriteFilePaths(tableName: string, files: SourceFile[]): Promise<void> {
  const updatedAt = new Date().toISOString();
  for (let offset = 0; offset < files.length; offset += TRANSACT_CHUNK) {
    const chunk = files.slice(offset, offset + TRANSACT_CHUNK);
    try {
      await dbClient.send(
        new TransactWriteItemsCommand({
          TransactItems: chunk.flatMap((file) => {
            const update = fileUpdate(tableName, file, updatedAt);
            return update ? [{ Update: update }] : [];
          }),
        })
      );
    } catch (error: unknown) {
      if (!isConditionalFailure(error)) throw error;
      for (const file of chunk) {
        await rewriteOneFile(tableName, file, updatedAt);
      }
    }
  }
}

async function updateRepertoireTitle(
  tableName: string,
  groupSlug: string,
  repertoireId: string,
  oldPrefix: string,
  newPrefix: string
): Promise<void> {
  const header = await findRepertoireHeader(tableName, groupSlug, repertoireId);
  if (!header) return;
  const next = nextRepertoireTitle(header.title, oldPrefix, newPrefix);
  if (!next) return;
  try {
    await dbClient.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: {
          PK: { S: `GROUP#${groupSlug}` },
          SK: { S: `REPERTOIRE#${repertoireId}` },
        },
        UpdateExpression: "SET #title = :next",
        ConditionExpression: "attribute_exists(PK) AND #title = :current",
        ExpressionAttributeNames: { "#title": "title" },
        ExpressionAttributeValues: {
          ":next": { S: next },
          ":current": { S: header.title },
        },
      })
    );
  } catch (error: unknown) {
    if (!isConditionalFailure(error)) throw error;
  }
}

async function readPointer(
  tableName: string,
  key: ItemKey
): Promise<{ repertoireId: string } | null> {
  const result = await dbClient.send(
    new GetItemCommand({
      TableName: tableName,
      Key: { PK: { S: key.PK }, SK: { S: key.SK } },
      ProjectionExpression: "repertoireId",
    })
  );
  if (!result.Item) return null;
  const repertoireId = (unmarshall(result.Item) as { repertoireId?: string }).repertoireId?.trim();
  if (!repertoireId) return null;
  return { repertoireId };
}

function pointerPut(tableName: string, key: ItemKey, repertoireId: string): TransactWriteItem {
  return {
    Put: {
      TableName: tableName,
      Item: marshall({
        ...key,
        repertoireId,
        type: "LibraryFolderChoir",
      }),
      ConditionExpression: "attribute_not_exists(PK)",
    },
  };
}

function pointerDelete(tableName: string, key: ItemKey, repertoireId: string): TransactWriteItem {
  return {
    Delete: {
      TableName: tableName,
      Key: { PK: { S: key.PK }, SK: { S: key.SK } },
      ConditionExpression: "attribute_exists(PK) AND repertoireId = :rid",
      ExpressionAttributeValues: { ":rid": { S: repertoireId } },
    },
  };
}

async function moveChoirPointer(
  tableName: string,
  link: LibraryFolderChoirLink,
  newSubPath: string,
  oldPrefix: string,
  newPrefix: string
): Promise<void> {
  const oldKey = libraryFolderPointerKey(link.folderPath, link.groupSlug);
  const newKey = libraryFolderPointerKey(newSubPath, link.groupSlug);
  const header = await findRepertoireHeader(tableName, link.groupSlug, link.repertoireId);
  const nextTitle = header ? nextRepertoireTitle(header.title, oldPrefix, newPrefix) : null;

  const items: TransactWriteItem[] = [
    pointerDelete(tableName, oldKey, link.repertoireId),
    pointerPut(tableName, newKey, link.repertoireId),
  ];
  if (header && nextTitle) {
    items.push({
      Update: {
        TableName: tableName,
        Key: {
          PK: { S: `GROUP#${link.groupSlug}` },
          SK: { S: `REPERTOIRE#${link.repertoireId}` },
        },
        UpdateExpression: "SET #title = :next",
        ConditionExpression: "attribute_exists(PK) AND #title = :current",
        ExpressionAttributeNames: { "#title": "title" },
        ExpressionAttributeValues: {
          ":next": { S: nextTitle },
          ":current": { S: header.title },
        },
      },
    });
  }

  try {
    await dbClient.send(new TransactWriteItemsCommand({ TransactItems: items }));
    return;
  } catch (error: unknown) {
    if (!isConditionalFailure(error)) throw error;
  }

  const [oldPointer, newPointer] = await Promise.all([
    readPointer(tableName, oldKey),
    readPointer(tableName, newKey),
  ]);

  if (!oldPointer && newPointer?.repertoireId === link.repertoireId) {
    await updateRepertoireTitle(tableName, link.groupSlug, link.repertoireId, oldPrefix, newPrefix);
    return;
  }

  if (oldPointer?.repertoireId === link.repertoireId && !newPointer) {
    await dbClient.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          pointerDelete(tableName, oldKey, link.repertoireId),
          pointerPut(tableName, newKey, link.repertoireId),
        ],
      })
    );
    await updateRepertoireTitle(tableName, link.groupSlug, link.repertoireId, oldPrefix, newPrefix);
    return;
  }

  if (
    oldPointer?.repertoireId === link.repertoireId &&
    newPointer?.repertoireId === link.repertoireId
  ) {
    await dbClient.send(
      new DeleteItemCommand({
        TableName: tableName,
        Key: { PK: { S: oldKey.PK }, SK: { S: oldKey.SK } },
        ConditionExpression: "repertoireId = :rid",
        ExpressionAttributeValues: { ":rid": { S: link.repertoireId } },
      })
    );
    await updateRepertoireTitle(tableName, link.groupSlug, link.repertoireId, oldPrefix, newPrefix);
    return;
  }

  if (newPointer && newPointer.repertoireId !== link.repertoireId) {
    throw new Error("Mappen är redan kopplad till en annan repertoar för den här kören.");
  }
}

async function moveFolderPointers(
  tableName: string,
  oldPrefix: string,
  newPrefix: string,
  oldFilePaths: string[]
): Promise<number> {
  const folderPaths = folderPathsForLibraryDelete(oldPrefix, oldFilePaths);
  let moved = 0;

  for (const oldSubPath of folderPaths) {
    const newSubPath = replaceFolderPrefix(oldSubPath, oldPrefix, newPrefix);
    if (!newSubPath || newSubPath === oldSubPath) continue;

    const links = await listLibraryFolderChoirs(tableName, oldSubPath);
    for (const link of links) {
      if (!isSafeToken(link.groupSlug, GROUP_SLUG_MAX) || !isSafeToken(link.repertoireId, 80)) {
        console.error("renameMaterialFolder: skipped unsafe choir link", link);
        continue;
      }
      await moveChoirPointer(tableName, link, newSubPath, oldPrefix, newPrefix);
      moved += 1;
    }

    const alreadyMoved = await listLibraryFolderChoirs(tableName, newSubPath);
    for (const link of alreadyMoved) {
      if (!isSafeToken(link.groupSlug, GROUP_SLUG_MAX) || !isSafeToken(link.repertoireId, 80)) continue;
      await updateRepertoireTitle(tableName, link.groupSlug, link.repertoireId, oldPrefix, newPrefix);
    }
  }

  return moved;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Serverkonfiguration saknas.");
  }

  const tableName = MAIN_TABLE;
  let lockHeld = false;
  let folderPath = "";
  let newFolderPath = "";

  try {
    const role = event.requestContext.authorizer?.lambda?.role;
    if (role !== "admin") {
      return sendError(403, "Forbidden: Admin access required.");
    }
    if (!event.body) {
      return sendError(400, "Request body is required.");
    }

    let folderPathRaw: unknown;
    let newNameRaw: unknown;
    try {
      const body = JSON.parse(event.body) as { folderPath?: unknown; newName?: unknown };
      folderPathRaw = body.folderPath;
      newNameRaw = body.newName;
    } catch {
      return sendError(400, "Ogiltig JSON.");
    }

    folderPath = normalizeFolderPath(folderPathRaw) ?? "";
    if (!folderPath) {
      return sendError(400, "Ange en giltig mappsökväg.");
    }

    const parsedName = parseFolderName(newNameRaw);
    if (parsedName.ok === false) {
      if (parsedName.reason === "too_long") {
        return sendError(400, "Sökvägen får vara högst 200 tecken.");
      }
      if (parsedName.reason === "invalid") {
        return sendError(400, "Mappnamnet får inte innehålla snedstreck, .. eller #.");
      }
      return sendError(400, "Ange ett mappnamn.");
    }

    const built = buildRenamedFolderPath(folderPath, parsedName.name);
    if (!built) {
      return sendError(400, "Sökvägen får vara högst 200 tecken.");
    }
    newFolderPath = built;

    if (newFolderPath === folderPath) {
      return sendResponse(
        {
          message: "Mappnamnet är oförändrat.",
          folderPath,
          previousFolderPath: folderPath,
          updatedFileCount: 0,
        },
        200
      );
    }

    const existingLock = await readRenameLock(tableName, folderPath);
    if (existingLock && existingLock !== newFolderPath) {
      return sendError(
        409,
        `Ett namnbyte till "${existingLock}" pågår redan för den här mappen. Spara det namnet igen för att slutföra bytet.`
      );
    }
    const continuing = existingLock === newFolderPath;

    const sourceRows = await queryFolderMaterialFiles(tableName, folderPath);
    if (sourceRows.length === 0 && !continuing) {
      return sendError(404, "Mappen hittades inte.");
    }

    const sourceFiles: SourceFile[] = [];
    for (const file of sourceRows) {
      if (!isSafeToken(file.materialId, 80)) {
        return sendError(500, "En fil i mappen har ett ogiltigt id och kan inte döpas om.");
      }
      const nextPath = replaceFolderPrefix(file.filePath, folderPath, newFolderPath);
      if (!nextPath) {
        return sendError(500, "En fil i mappen ligger utanför sökvägen och kan inte döpas om.");
      }
      sourceFiles.push({ materialId: file.materialId, filePath: file.filePath, nextPath });
    }

    if (!continuing) {
      const acquired = await acquireRenameLock(tableName, folderPath, newFolderPath);
      if (acquired.ok === false) {
        return sendError(409, acquired.message);
      }
    }
    lockHeld = true;

    const destinationRows = await queryFolderMaterialFiles(tableName, newFolderPath);
    if (sourceRows.length === 0 && destinationRows.length === 0) {
      await releaseRenameLock(tableName, folderPath, newFolderPath);
      lockHeld = false;
      return sendError(404, "Mappen hittades inte.");
    }
    if (
      folderRenameConflict(sourceRows, destinationRows, folderPath, newFolderPath, continuing)
    ) {
      if (!continuing) {
        await releaseRenameLock(tableName, folderPath, newFolderPath);
        lockHeld = false;
      }
      return sendError(409, "En mapp med det namnet finns redan.");
    }

    await rewriteFilePaths(tableName, sourceFiles);

    const oldFilePaths = [
      ...sourceRows.map((file) => file.filePath),
      ...destinationRows
        .map((file) => replaceFolderPrefix(file.filePath, newFolderPath, folderPath))
        .filter((path): path is string => path !== null),
    ];
    const updatedChoirCount = await moveFolderPointers(
      tableName,
      folderPath,
      newFolderPath,
      oldFilePaths
    );

    await releaseRenameLock(tableName, folderPath, newFolderPath);
    lockHeld = false;

    return sendResponse(
      {
        message: "Mappen har bytt namn.",
        folderPath: newFolderPath,
        previousFolderPath: folderPath,
        updatedFileCount: sourceFiles.length,
        updatedChoirCount,
      },
      200
    );
  } catch (error: unknown) {
    console.error("renameMaterialFolder failed:", error);
    if (lockHeld) {
      console.error("renameMaterialFolder: lock kept for retry", { folderPath, newFolderPath });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    return sendError(500, message);
  }
};
