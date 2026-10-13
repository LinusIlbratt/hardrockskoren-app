import { DynamoDBClient, PutItemCommand, BatchWriteItemCommand, WriteRequest } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import { nanoid } from "nanoid";
import { requireGroupAccessResponse, normalizeGroupSlug } from "./lib/requireGroupAccess";
import {
  findLinkedRepertoire,
  normalizeFolderPath,
  putLibraryFolderPointer,
  queryFolderMaterials,
} from "./lib/libraryFolderChoirs";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Serverkonfiguration saknas.");
  }

  try {
    const authDenied = await requireGroupAccessResponse(
      event.requestContext.authorizer?.lambda,
      event.pathParameters?.groupName
    );
    if (authDenied) {
      return authDenied;
    }

    const groupName = normalizeGroupSlug(event.pathParameters?.groupName);
    if (!groupName) {
      return sendError(400, "Gruppnamn krävs.");
    }

    if (!event.body) return sendError(400, "Request body is required.");
    let folderPathRaw: unknown;
    try {
      folderPathRaw = (JSON.parse(event.body) as { folderPath?: unknown }).folderPath;
    } catch {
      return sendError(400, "Ogiltig JSON.");
    }
    const folderPath = normalizeFolderPath(folderPathRaw);
    if (!folderPath) return sendError(400, "folderPath is required in the request body.");

    const existing = await findLinkedRepertoire(MAIN_TABLE, groupName, folderPath);
    if (existing) {
      await putLibraryFolderPointer(MAIN_TABLE, folderPath, groupName, existing.repertoireId);
      return sendResponse(
        {
          message: "Repertoaren finns redan.",
          item: {
            repertoireId: existing.repertoireId,
            title: folderPath,
          },
        },
        200
      );
    }

    const repertoireId = nanoid();
    const repertoireItem = {
      PK: `GROUP#${groupName}`,
      SK: `REPERTOIRE#${repertoireId}`,
      repertoireId,
      title: folderPath,
      createdAt: new Date().toISOString(),
      type: "Repertoire",
    };
    await dbClient.send(
      new PutItemCommand({
        TableName: MAIN_TABLE,
        Item: marshall(repertoireItem),
        ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)",
      })
    );

    await putLibraryFolderPointer(MAIN_TABLE, folderPath, groupName, repertoireId);

    const materials = await queryFolderMaterials(MAIN_TABLE, folderPath);
    if (materials.length === 0) {
      return sendResponse({ message: "Repertoire created from empty folder.", item: repertoireItem }, 201);
    }

    const linkRequests: WriteRequest[] = materials.map((material) => {
      const linkItem = {
        PK: `REPERTOIRE#${repertoireId}`,
        SK: `MATERIAL#${material.materialId}`,
        materialId: material.materialId,
        repertoireId,
        groupName,
        createdAt: new Date().toISOString(),
        type: "RepertoireMaterialLink",
      };
      return { PutRequest: { Item: marshall(linkItem) } };
    });

    for (let i = 0; i < linkRequests.length; i += 25) {
      const batch = linkRequests.slice(i, i + 25);
      await dbClient.send(
        new BatchWriteItemCommand({
          RequestItems: { [MAIN_TABLE]: batch },
        })
      );
    }

    return sendResponse(
      { message: `Repertoire created and linked to ${materials.length} material(s).`, item: repertoireItem },
      201
    );
  } catch (error: unknown) {
    console.error("Error creating repertoire from library:", error);
    const name = error instanceof Error ? error.name : "";
    if (name === "ConditionalCheckFailedException") {
      return sendError(409, "A repertoire item with this ID already exists.");
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    return sendError(500, message);
  }
};
