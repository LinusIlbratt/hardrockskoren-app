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
import { sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import {
  isConcertOpenForSignup,
  isSharedConcertVisible,
  sharedConcertMetaSk,
  sharedConcertPk,
} from "../lib/keys";
import { parsePathId } from "../lib/parse";
import { cancelSignupTransactItems } from "../lib/cancelSignupWrite";
import { resolveViewerSignupDeleteTarget } from "../lib/store";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * DELETE /shared-concerts/{id}/signups
 *
 * Access path:
 * - Identity: authorizer uuid. Nothing from the body.
 * - GetItem META  PK SHARED_CONCERT#{id} / SK META
 * - GetItem SIGNUPREF#{uuid}, then GetItem the signup SK it points at.
 *   Fallback GetItem legacy SIGNUP#{uuid}.
 * - Pre-checks: META exists, status is not deleting, concertDate >= today
 *   (Europe/Stockholm). Missing signup → 404.
 * - TransactWrite: Delete ref (when present), Delete signup
 *   (attribute_exists AND userUuid = uuid), Update META ADD signupCount -1
 *   (exists, count >= 1, still open, not deleting).
 */

type TransactionFailureKind = "missing_signup" | "concert_unavailable" | "other" | null;

function transactionFailureKind(
  err: unknown,
  itemCount: number
): TransactionFailureKind {
  if (!err || typeof err !== "object") return null;
  const name = "name" in err ? String((err as { name: unknown }).name) : "";
  if (name !== "TransactionCanceledException") return null;
  const reasons = (err as { CancellationReasons?: Array<{ Code?: string }> })
    .CancellationReasons;
  if (!Array.isArray(reasons) || reasons.length < 2 || reasons.length < itemCount) {
    return "other";
  }

  const metaIndex = itemCount - 1;
  const signupIndex = itemCount - 2;
  if (reasons[metaIndex]?.Code === "ConditionalCheckFailed") {
    return "concert_unavailable";
  }
  if (reasons[signupIndex]?.Code === "ConditionalCheckFailed") {
    return "missing_signup";
  }
  if (itemCount === 3 && reasons[0]?.Code === "ConditionalCheckFailed") {
    return "missing_signup";
  }
  return "other";
}

function sendNoContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204 };
}

async function cancelUnavailableResponse(
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
    if (!concert || concert.type !== "SharedConcert") {
      return sendError(404, "Konserten hittades inte.");
    }
    if (!isSharedConcertVisible(concert) || concert.status === "deleting") {
      return sendError(409, "Konserten håller på att tas bort.");
    }
    if (!isConcertOpenForSignup(String(concert.concertDate))) {
      return sendError(400, "Anmälan är stängd för denna konsert.");
    }
    const count = concert.signupCount;
    if (typeof count !== "number" || count < 1) {
      return sendError(409, "Kunde inte uppdatera anmälningsräknaren.");
    }
    return sendError(409, "Kunde inte avanmäla just nu.");
  } catch (readErr) {
    console.error("cancelUnavailableResponse: META read failed", {
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

  const now = new Date();

  try {
    const [metaResult, target] = await Promise.all([
      docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            PK: sharedConcertPk(concertId),
            SK: sharedConcertMetaSk(),
          },
        })
      ),
      resolveViewerSignupDeleteTarget(docClient, tableName, concertId, uuid),
    ]);

    const concert = metaResult.Item;
    if (!concert || concert.type !== "SharedConcert") {
      return sendError(404, "Konserten hittades inte.");
    }
    if (!isSharedConcertVisible(concert) || concert.status === "deleting") {
      return sendError(409, "Konserten håller på att tas bort.");
    }
    if (!isConcertOpenForSignup(String(concert.concertDate), now)) {
      return sendError(400, "Anmälan är stängd för denna konsert.");
    }
    if (!target) {
      return sendError(404, "Ingen aktiv anmälan hittades.");
    }

    const transactItems = cancelSignupTransactItems({
      tableName,
      concertId,
      userUuid: uuid,
      signupSk: target.signupSk,
      deleteRef: target.deleteRef,
      now,
    });

    await docClient.send(
      new TransactWriteCommand({ TransactItems: transactItems })
    );

    return sendNoContent();
  } catch (err) {
    console.error("cancelConcertSignup failed", { concertId, userUuid: uuid, err });
    const reasons =
      err &&
      typeof err === "object" &&
      Array.isArray(
        (err as { CancellationReasons?: unknown[] }).CancellationReasons
      )
        ? (err as { CancellationReasons: unknown[] }).CancellationReasons.length
        : 0;
    const kind = transactionFailureKind(err, reasons);
    if (kind === "missing_signup") {
      return sendError(404, "Ingen aktiv anmälan hittades.");
    }
    if (kind === "concert_unavailable") {
      return cancelUnavailableResponse(tableName, concertId);
    }
    return sendError(500, "Kunde inte avanmäla.");
  }
};
