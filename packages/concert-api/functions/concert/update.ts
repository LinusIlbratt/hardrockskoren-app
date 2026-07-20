import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import {
  isConcertOpenForSignup,
  listGsi1Pk,
  listGsi1Sk,
  sharedConcertMetaSk,
  sharedConcertPk,
} from "../lib/keys";
import {
  parseJsonBody,
  parsePathId,
  parseUpdateConcertBody,
  toPublicConcert,
  type UpdateConcertFields,
} from "../lib/parse";
import { getSharedConcert } from "../lib/store";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

function buildUpdateExpression(
  concertId: string,
  updates: UpdateConcertFields,
  expectedVersion: number
): {
  updateExpression: string;
  names: Record<string, string>;
  values: Record<string, unknown>;
  conditionExpression: string;
} {
  const setParts: string[] = ["#version = :nextVersion"];
  const removeParts: string[] = [];
  const names: Record<string, string> = {
    "#type": "type",
    "#version": "version",
    "#status": "status",
  };
  const values: Record<string, unknown> = {
    ":concertType": "SharedConcert",
    ":expected": expectedVersion,
    ":nextVersion": expectedVersion + 1,
    ":one": 1,
    ":deleting": "deleting",
  };

  if (updates.title !== undefined) {
    setParts.push("#title = :title");
    names["#title"] = "title";
    values[":title"] = updates.title;
  }

  if (updates.concertDate !== undefined) {
    setParts.push(
      "#concertDate = :concertDate",
      "#GSI1PK = :gsi1pk",
      "#GSI1SK = :gsi1sk"
    );
    names["#concertDate"] = "concertDate";
    names["#GSI1PK"] = "GSI1PK";
    names["#GSI1SK"] = "GSI1SK";
    values[":concertDate"] = updates.concertDate;
    values[":gsi1pk"] = listGsi1Pk(updates.concertDate);
    values[":gsi1sk"] = listGsi1Sk(updates.concertDate, concertId);
  }

  if (updates.location !== undefined) {
    setParts.push("#location = :location");
    names["#location"] = "location";
    values[":location"] = updates.location;
  }

  if (updates.description === null) {
    removeParts.push("#description");
    names["#description"] = "description";
  } else if (updates.description !== undefined) {
    setParts.push("#description = :description");
    names["#description"] = "description";
    values[":description"] = updates.description;
  }

  const updateExpression = [
    setParts.length > 0 ? `SET ${setParts.join(", ")}` : "",
    removeParts.length > 0 ? `REMOVE ${removeParts.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Block PATCH while cascade-delete tombstone is set. Legacy rows without
  // version are treated as version 1 (expected must be 1).
  const conditionExpression =
    "attribute_exists(PK) AND #type = :concertType AND (attribute_not_exists(#status) OR #status <> :deleting) AND ((attribute_not_exists(#version) AND :expected = :one) OR #version = :expected)";

  return { updateExpression, names, values, conditionExpression };
}

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  const tableName = process.env.MAIN_TABLE;
  if (!tableName) {
    return sendError(500, "Server configuration error.");
  }

  const uuid = event.requestContext.authorizer?.lambda?.uuid?.trim();
  if (!uuid) {
    return sendError(401, "User identity is missing from the request context.");
  }

  const concertId = parsePathId(event.pathParameters?.id);
  if (!concertId) {
    return sendError(400, "Concert id is required in the path.");
  }

  const parsed = parseJsonBody(event.body);
  if (parsed.ok === false) {
    return sendError(400, parsed.message);
  }

  try {
    const existing = await getSharedConcert(docClient, tableName, concertId);
    if (!existing) {
      return sendError(404, "Konserten hittades inte.");
    }

    const content = parseUpdateConcertBody(parsed.body, existing);
    if (content.ok === false) {
      return sendError(400, content.message);
    }

    const { updateExpression, names, values, conditionExpression } =
      buildUpdateExpression(
        concertId,
        content.updates,
        content.expectedVersion
      );

    const result = await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: {
          PK: sharedConcertPk(concertId),
          SK: sharedConcertMetaSk(),
        },
        UpdateExpression: updateExpression,
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      })
    );

    const updated = result.Attributes;
    if (!updated || updated.type !== "SharedConcert") {
      return sendError(500, "Failed to update shared concert.");
    }

    return sendResponse(
      toPublicConcert(
        updated as typeof existing,
        isConcertOpenForSignup(String(updated.concertDate))
      )
    );
  } catch (err) {
    console.error("updateSharedConcert failed", { concertId, err });
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    if (name === "ConditionalCheckFailedException") {
      const stillThere = await getSharedConcert(docClient, tableName, concertId);
      if (!stillThere) {
        return sendError(404, "Konserten hittades inte.");
      }
      return sendError(
        409,
        "Konserten har ändrats av någon annan. Ladda om och försök igen."
      );
    }
    return sendError(500, "Failed to update shared concert.");
  }
};
