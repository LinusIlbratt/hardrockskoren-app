import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import {
  GROUP_SLUG_MAX,
  listLibraryFolderChoirs,
  normalizeFolderPath,
  queryFolderMaterialFiles,
  removeRepertoireRecords,
  batchWriteWithRetry,
  type LibraryFolderChoirLink,
} from "./lib/libraryFolderChoirs";
import {
  folderPathsForLibraryDelete,
  isSafeToken,
  type ItemKey,
} from "./lib/libraryFolderKeys";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const MAIN_TABLE = process.env.MAIN_TABLE;
const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

const S3_DELETE_BATCH = 1000;

function deleteRequest(key: ItemKey) {
  return {
    DeleteRequest: {
      Key: {
        PK: { S: key.PK },
        SK: { S: key.SK },
      },
    },
  };
}

function safeFileKey(value: string | undefined): string | null {
  if (!value) return null;
  const key = value.trim();
  return key.length > 0 ? key : null;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE || !BUCKET_NAME || !COGNITO_USER_POOL_ID) {
    return sendError(500, "Serverkonfiguration saknas.");
  }

  try {
    const userId = event.requestContext.authorizer?.lambda?.uuid;
    if (!userId) {
      return sendError(403, "Forbidden: User not identifiable.");
    }

    const userResponse = await cognitoClient.send(
      new AdminGetUserCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: userId,
      })
    );
    const role = userResponse.UserAttributes?.find((attr) => attr.Name === "custom:role")?.Value;
    if (role !== "admin") {
      return sendError(403, "Forbidden: Admin access required.");
    }

    if (!event.body) {
      return sendError(400, "Request body is required.");
    }

    let folderPathRaw: unknown;
    try {
      folderPathRaw = (JSON.parse(event.body) as { folderPath?: unknown }).folderPath;
    } catch {
      return sendError(400, "Ogiltig JSON.");
    }

    const folderPath = normalizeFolderPath(folderPathRaw);
    if (!folderPath) {
      return sendError(400, "folderPath is required.");
    }

    const files = await queryFolderMaterialFiles(MAIN_TABLE, folderPath);
    const folderPaths = folderPathsForLibraryDelete(
      folderPath,
      files.map((file) => file.filePath)
    );

    const links: LibraryFolderChoirLink[] = [];
    for (const path of folderPaths) {
      links.push(...(await listLibraryFolderChoirs(MAIN_TABLE, path)));
    }

    let removedRepertoireCount = 0;
    for (const link of links) {
      if (
        !isSafeToken(link.groupSlug, GROUP_SLUG_MAX) ||
        !isSafeToken(link.repertoireId, 80)
      ) {
        console.error("deleteLibraryFolder: skipped unsafe choir link", link);
        continue;
      }
      await removeRepertoireRecords(
        MAIN_TABLE,
        link.groupSlug,
        link.repertoireId,
        link.folderPath
      );
      removedRepertoireCount += 1;
    }

    const fileKeys = [
      ...new Set(
        files
          .map((file) => safeFileKey(file.fileKey))
          .filter((key): key is string => key !== null)
      ),
    ];

    for (let offset = 0; offset < fileKeys.length; offset += S3_DELETE_BATCH) {
      const chunk = fileKeys.slice(offset, offset + S3_DELETE_BATCH);
      const deleted = await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: chunk.map((Key) => ({ Key })) },
        })
      );
      if (deleted.Errors && deleted.Errors.length > 0) {
        console.error("deleteLibraryFolder: S3 DeleteObjects errors", deleted.Errors);
        return sendError(
          500,
          "Kunde inte radera alla filer i lagringen. Biblioteksposterna har inte raderats."
        );
      }
    }

    const materialIds = [
      ...new Set(
        files
          .map((file) => file.materialId.trim())
          .filter((id) => isSafeToken(id, 80))
      ),
    ];
    const materialKeys: ItemKey[] = materialIds.map((id) => ({
      PK: `MATERIAL#${id}`,
      SK: `MATERIAL#${id}`,
    }));
    if (materialKeys.length > 0) {
      await batchWriteWithRetry(MAIN_TABLE, materialKeys.map(deleteRequest));
    }

    return sendResponse(
      {
        message:
          removedRepertoireCount === 0
            ? "Mappen har raderats ur biblioteket."
            : `Mappen har raderats ur biblioteket och ur ${removedRepertoireCount} repertoar(er).`,
        folderPath,
        deletedFileCount: materialIds.length,
        removedRepertoireCount,
      },
      200
    );
  } catch (error: unknown) {
    console.error("deleteLibraryFolder failed:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return sendError(500, message);
  }
};
