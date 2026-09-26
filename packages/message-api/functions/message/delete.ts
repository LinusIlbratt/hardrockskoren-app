import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import {
  ALL_TARGET,
  groupPk,
  messageCanonicalPk,
  messageRefSk,
  normalizeTarget,
} from "../lib/keys";
import { getCanonicalMessage } from "../lib/feed";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (
  event: AuthorizedEvent
): Promise<APIGatewayProxyResultV2> => {
  const tableName = process.env.MAIN_TABLE;
  if (!tableName) {
    return sendError(500, "Server configuration error.");
  }

  const messageId = event.pathParameters?.messageId?.trim();
  if (!messageId) {
    return sendError(400, "messageId is required in the path.");
  }

  const querySlug = normalizeTarget(event.queryStringParameters?.groupSlug);

  try {
    const message = await getCanonicalMessage(docClient, tableName, messageId);
    if (!message) {
      return sendError(404, "Message not found.");
    }

    if (querySlug) {
      const allowed =
        message.targets.includes(querySlug) ||
        (querySlug === ALL_TARGET && message.scope === "all");
      if (!allowed) {
        return sendError(400, "groupSlug query does not match message targets.");
      }
    }

    const refDeletes = message.targets.map((groupSlug) => ({
      Delete: {
        TableName: tableName,
        Key: {
          PK: groupPk(groupSlug),
          SK: messageRefSk(message.createdAt, messageId),
        },
      },
    }));

    // Legacy MessageMeta also used targetPk/targetSk — getCanonical adapts Meta to targets[];
    // legacy full Message under GROUP may remain if old fan-out used different SK; best-effort
    // delete via MessageMeta fields is covered when targets+[createdAt] match MessageRef or old Message SK.

    const transactItems = [
      {
        Delete: {
          TableName: tableName,
          Key: { PK: messageCanonicalPk(messageId), SK: "META" },
        },
      },
      ...refDeletes,
    ];

    if (transactItems.length > 100) {
      return sendError(500, "Message has too many targets to delete atomically.");
    }

    try {
      await docClient.send(
        new TransactWriteCommand({ TransactItems: transactItems })
      );
    } catch (txErr) {
      // Legacy MessageMeta: refs may use same SK pattern; if transaction fails due to
      // missing refs, delete canonical alone then best-effort refs.
      console.warn("deleteMessage TransactWrite failed, falling back", txErr);
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { PK: messageCanonicalPk(messageId), SK: "META" },
        })
      );
      for (const groupSlug of message.targets) {
        try {
          await docClient.send(
            new DeleteCommand({
              TableName: tableName,
              Key: {
                PK: groupPk(groupSlug),
                SK: messageRefSk(message.createdAt, messageId),
              },
            })
          );
        } catch (refErr) {
          console.warn("deleteMessage ref cleanup failed", groupSlug, refErr);
        }
      }
    }

    return sendResponse({
      ok: true,
      messageId,
      targets: message.targets,
      scope: message.scope,
      groupSlug:
        message.scope === "all" ? ALL_TARGET : message.targets[0] ?? null,
    });
  } catch (err) {
    console.error("deleteMessage failed", err);
    return sendError(500, "Failed to delete message.");
  }
};
