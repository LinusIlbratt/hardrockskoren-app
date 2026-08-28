import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import {
  addFolderToChoir,
  assertChoirsExist,
  normalizeFolderPath,
  normalizeGroupSlugs,
  queryFolderMaterials,
} from "./lib/libraryFolderChoirs";

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});
const MAIN_TABLE = process.env.MAIN_TABLE;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE || !COGNITO_USER_POOL_ID) {
    return sendError(500, "Server configuration error.");
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
    const role = userResponse.UserAttributes?.find((a) => a.Name === "custom:role")?.Value;
    if (role !== "admin") {
      return sendError(403, "Forbidden: Admin access required.");
    }

    if (!event.body) {
      return sendError(400, "Request body is required.");
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body) as Record<string, unknown>;
    } catch {
      return sendError(400, "Invalid JSON format in request body.");
    }

    const folderPath = normalizeFolderPath(body.folderPath);
    if (!folderPath) {
      return sendError(400, "folderPath is required.");
    }

    const slugsResult = normalizeGroupSlugs(body.groupSlugs);
    if (!slugsResult.ok) {
      return sendError(400, slugsResult.message);
    }

    const existence = await assertChoirsExist(MAIN_TABLE, slugsResult.slugs);
    if (!existence.ok) {
      return sendError(
        404,
        `Kör(er) hittades inte: ${existence.missing.join(", ")}.`
      );
    }

    const materials = await queryFolderMaterials(MAIN_TABLE, folderPath);
    const results = [];

    for (const groupSlug of slugsResult.slugs) {
      results.push(
        await addFolderToChoir(MAIN_TABLE, groupSlug, folderPath, materials)
      );
    }

    const added = results.filter((r) => r.status === "added");
    const skipped = results.filter((r) => r.status === "skipped");
    const failed = results.filter((r) => r.status === "failed");

    return sendResponse(
      {
        folderPath,
        materialCount: materials.length,
        addedCount: added.length,
        skippedCount: skipped.length,
        failedCount: failed.length,
        results,
      },
      failed.length > 0 && added.length === 0 ? 500 : 200
    );
  } catch (error: unknown) {
    console.error("addLibraryFolderToChoirs failed:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return sendError(500, message);
  }
};
