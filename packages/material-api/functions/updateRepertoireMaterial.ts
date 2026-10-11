import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import {
  normalizeGroupSlug,
  requireGroupAccessResponse,
} from "./lib/requireGroupAccess";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

const MAX_VOICE_LABEL = 60;
const MAX_SONG_TITLE = 120;

type OverrideField = "voiceLabel" | "songTitle";

function readPathId(raw: string | undefined): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const value = decoded.trim();
  if (!value || value.length > 80 || value.includes("#") || value.includes("/")) {
    return null;
  }
  if (/[\u0000-\u001F]/.test(value)) return null;
  return value;
}

function parseOverride(
  value: unknown,
  maxLength: number,
  field: OverrideField
): { error: string | null; value: string | null } {
  if (value === null) return { error: null, value: null };
  if (typeof value !== "string") {
    return { error: `${field} måste vara text.`, value: null };
  }
  const trimmed = value.trim();
  if (!trimmed) return { error: null, value: null };
  if (trimmed.length > maxLength) {
    return { error: `${field} får vara högst ${maxLength} tecken.`, value: null };
  }
  if (/[\u0000-\u001F]/.test(trimmed)) {
    return { error: `${field} innehåller ogiltiga tecken.`, value: null };
  }
  return { error: null, value: trimmed };
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error.");
  }

  try {
    const { groupName, repertoireId: rawRepertoireId, materialId: rawMaterialId } =
      event.pathParameters || {};

    const authDenied = await requireGroupAccessResponse(
      event.requestContext.authorizer?.lambda,
      groupName
    );
    if (authDenied) return authDenied;

    const groupSlug = normalizeGroupSlug(groupName);
    const repertoireId = readPathId(rawRepertoireId);
    const materialId = readPathId(rawMaterialId);
    if (!groupSlug || !repertoireId || !materialId) {
      return sendError(400, "Ogiltig sökväg.");
    }

    let body: unknown;
    try {
      body = event.body ? JSON.parse(event.body) : null;
    } catch {
      return sendError(400, "Ogiltig JSON.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendError(400, "Ogiltig förfrågan.");
    }

    const record = body as Record<string, unknown>;
    const allowed = new Set(["voiceLabel", "songTitle"]);
    for (const key of Object.keys(record)) {
      if (!allowed.has(key)) {
        return sendError(400, "Ogiltigt fält i förfrågan.");
      }
    }
    if (!("voiceLabel" in record) && !("songTitle" in record)) {
      return sendError(400, "Skicka voiceLabel och/eller songTitle.");
    }

    const updates: Partial<Record<OverrideField, string | null>> = {};
    if ("voiceLabel" in record) {
      const parsed = parseOverride(record.voiceLabel, MAX_VOICE_LABEL, "voiceLabel");
      if (parsed.error) return sendError(400, parsed.error);
      updates.voiceLabel = parsed.value;
    }
    if ("songTitle" in record) {
      const parsed = parseOverride(record.songTitle, MAX_SONG_TITLE, "songTitle");
      if (parsed.error) return sendError(400, parsed.error);
      updates.songTitle = parsed.value;
    }

    const repertoire = await dbClient.send(
      new GetItemCommand({
        TableName: MAIN_TABLE,
        Key: marshall({
          PK: `GROUP#${groupSlug}`,
          SK: `REPERTOIRE#${repertoireId}`,
        }),
        ProjectionExpression: "repertoireId",
      })
    );
    if (!repertoire.Item) {
      return sendError(404, "Repertoaren hittades inte.");
    }

    const names: Record<string, string> = {};
    const values: Record<string, { S: string }> = {};
    const sets: string[] = [];
    const removes: string[] = [];

    (Object.keys(updates) as OverrideField[]).forEach((field) => {
      const nameKey = `#${field}`;
      names[nameKey] = field;
      const next = updates[field];
      if (next) {
        const valueKey = `:${field}`;
        sets.push(`${nameKey} = ${valueKey}`);
        values[valueKey] = { S: next };
      } else {
        removes.push(nameKey);
      }
    });

    const expression = [
      sets.length ? `SET ${sets.join(", ")}` : "",
      removes.length ? `REMOVE ${removes.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const updated = await dbClient.send(
      new UpdateItemCommand({
        TableName: MAIN_TABLE,
        Key: marshall({
          PK: `REPERTOIRE#${repertoireId}`,
          SK: `MATERIAL#${materialId}`,
        }),
        UpdateExpression: expression,
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: names,
        ...(Object.keys(values).length ? { ExpressionAttributeValues: values } : {}),
        ReturnValues: "ALL_NEW",
      })
    );

    const saved = updated.Attributes ? unmarshall(updated.Attributes) : {};
    const voiceLabel = typeof saved.voiceLabel === "string" ? saved.voiceLabel : undefined;
    const songTitle = typeof saved.songTitle === "string" ? saved.songTitle : undefined;

    return sendResponse(
      {
        materialId,
        ...(voiceLabel ? { voiceLabel } : {}),
        ...(songTitle ? { songTitle } : {}),
      },
      200
    );
  } catch (error: unknown) {
    const name = error instanceof Error ? error.name : "";
    if (name === "ConditionalCheckFailedException") {
      return sendError(404, "Materialet finns inte i den här repertoaren.");
    }
    console.error("Error updating repertoire material label:", error);
    return sendError(500, "Kunde inte spara stämma och låtnamn.");
  }
};
