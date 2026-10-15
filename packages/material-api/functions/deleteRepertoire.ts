import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import { requireGroupAccessResponse, normalizeGroupSlug } from "./lib/requireGroupAccess";
import {
  findRepertoireHeader,
  normalizeFolderPath,
  removeRepertoireRecords,
} from "./lib/libraryFolderChoirs";
import { isSafeToken } from "./lib/libraryFolderKeys";

const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Serverkonfiguration saknas.");
  }

  try {
    const { groupName, repertoireId: rawRepertoireId } = event.pathParameters || {};

    const authDenied = await requireGroupAccessResponse(
      event.requestContext.authorizer?.lambda,
      groupName
    );
    if (authDenied) {
      return authDenied;
    }

    const groupSlug = normalizeGroupSlug(groupName);
    const repertoireId = (rawRepertoireId || "").trim();
    if (!groupSlug || !isSafeToken(repertoireId, 80)) {
      return sendError(400, "Gruppnamn och repertoar-id krävs.");
    }

    const header = await findRepertoireHeader(MAIN_TABLE, groupSlug, repertoireId);
    if (!header) {
      return sendResponse({ message: "Repertoaren hittades inte." }, 200);
    }

    const folderPath = normalizeFolderPath(header.title);
    await removeRepertoireRecords(MAIN_TABLE, groupSlug, repertoireId, folderPath);

    return sendResponse({ message: "Repertoaren har tagits bort." }, 200);
  } catch (error: unknown) {
    console.error("Error deleting repertoire:", error);
    return sendError(500, "Ett internt serverfel uppstod");
  }
};
