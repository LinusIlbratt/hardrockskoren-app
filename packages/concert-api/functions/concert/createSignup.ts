import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import { requireGroupAccessResponse } from "../../../core/utils/requireGroupAccess";
import {
  concertSignupSk,
  concertSignupRefSk,
  isConcertOpenForSignup,
  isSharedConcertVisible,
  sharedConcertPk,
  sharedConcertMetaSk,
  META_OPEN_FOR_SIGNUP_CONDITION,
  META_OPEN_FOR_SIGNUP_NAMES,
  metaOpenForSignupValues,
  type ConcertSignupRecord,
  type ConcertSignupRefRecord,
} from "../lib/keys";
import {
  parseJsonBody,
  parsePathId,
  parseSignupBody,
  toPublicSignup,
} from "../lib/parse";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

type TransactionFailureKind =
  | "duplicate"
  | "concert_unavailable"
  | "other"
  | null;

function transactionFailureKind(err: unknown): TransactionFailureKind {
  if (!err || typeof err !== "object") return null;
  const name = "name" in err ? String((err as { name: unknown }).name) : "";
  if (name !== "TransactionCanceledException") return null;
  const reasons = (err as { CancellationReasons?: Array<{ Code?: string }> })
    .CancellationReasons;
  // TransactItems: [0]=Put SIGNUPREF, [1]=Put SIGNUP, [2]=Update META
  if (!Array.isArray(reasons) || reasons.length < 3) return "other";

  if (reasons[0]?.Code === "ConditionalCheckFailed") return "duplicate";
  if (reasons[2]?.Code === "ConditionalCheckFailed") return "concert_unavailable";
  return "other";
}

/**
 * Post-failure classification only — never used on the happy path.
 * Resilient if META Get fails or concert vanished mid-delete.
 */
async function signupUnavailableResponse(
  tableName: string,
  concertId: string
): Promise<ReturnType<typeof sendError>> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: sharedConcertPk(concertId),
          SK: sharedConcertMetaSk(),
        },
      })
    );
    const concert = result.Item;

    if (
      !concert ||
      concert.type !== "SharedConcert" ||
      !isSharedConcertVisible(concert)
    ) {
      return sendError(404, "Konserten hittades inte.");
    }
    if (concert.status === "deleting") {
      return sendError(409, "Konserten håller på att tas bort.");
    }
    if (!isConcertOpenForSignup(String(concert.concertDate))) {
      return sendError(400, "Anmälan är stängd för denna konsert.");
    }
    return sendError(409, "Konserten accepterar inte anmälningar just nu.");
  } catch (readErr) {
    console.error("signupUnavailableResponse: META read failed", {
      concertId,
      readErr,
    });
    return sendError(404, "Konserten hittades inte.");
  }
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

  const content = parseSignupBody(parsed.body);
  if (content.ok === false) {
    return sendError(400, content.message);
  }

  // Cognito membership check only (no DynamoDB pre-read of concert META).
  const denied = await requireGroupAccessResponse(
    event.requestContext.authorizer?.lambda,
    content.choirSlug
  );
  if (denied) return denied;

  const now = new Date();
  const createdAt = now.toISOString();
  const signupSk = concertSignupSk(createdAt, uuid);
  const metaKey = {
    PK: sharedConcertPk(concertId),
    SK: sharedConcertMetaSk(),
  };
  const openValues = metaOpenForSignupValues(now);

  // choirName omitted on write path — UI falls back to choirSlug (avoids GetItem RCU).
  const signupRef: ConcertSignupRefRecord = {
    PK: sharedConcertPk(concertId),
    SK: concertSignupRefSk(uuid),
    type: "ConcertSignupRef",
    concertId,
    userUuid: uuid,
    signupSk,
    createdAt,
  };

  const signup: ConcertSignupRecord = {
    PK: sharedConcertPk(concertId),
    SK: signupSk,
    type: "ConcertSignup",
    concertId,
    userUuid: uuid,
    firstName: content.firstName,
    lastName: content.lastName,
    choirSlug: content.choirSlug,
    createdAt,
    status: "active",
  };

  try {
    // Happy path: no concert META GetItem — open/status validated in Update ConditionExpression.
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: signupRef,
              ConditionExpression: "attribute_not_exists(SK)",
            },
          },
          {
            Put: {
              TableName: tableName,
              Item: signup,
              ConditionExpression: "attribute_not_exists(SK)",
            },
          },
          {
            Update: {
              TableName: tableName,
              Key: metaKey,
              UpdateExpression: "ADD signupCount :one",
              ConditionExpression: META_OPEN_FOR_SIGNUP_CONDITION,
              ExpressionAttributeNames: { ...META_OPEN_FOR_SIGNUP_NAMES },
              ExpressionAttributeValues: {
                ...openValues,
                ":one": 1,
              },
            },
          },
        ],
      })
    );

    return sendResponse(toPublicSignup(signup), 201);
  } catch (err) {
    console.error("createConcertSignup failed", { concertId, userUuid: uuid, err });
    const kind = transactionFailureKind(err);
    if (kind === "duplicate") {
      return sendError(409, "Du är redan anmäld.");
    }
    if (kind === "concert_unavailable") {
      return signupUnavailableResponse(tableName, concertId);
    }
    return sendError(500, "Failed to create concert signup.");
  }
};
