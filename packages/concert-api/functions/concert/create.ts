import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { nanoid } from "nanoid";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";
import type { AuthContext } from "../../../core/types";
import {
  listGsi1Pk,
  listGsi1Sk,
  sharedConcertPk,
  sharedConcertMetaSk,
  isConcertOpenForSignup,
  type SharedConcertRecord,
} from "../lib/keys";
import { parseCreateConcertBody, parseJsonBody, toPublicConcert } from "../lib/parse";

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

  const uuid = event.requestContext.authorizer?.lambda?.uuid?.trim();
  if (!uuid) {
    return sendError(401, "User identity is missing from the request context.");
  }

  const parsed = parseJsonBody(event.body);
  if (parsed.ok === false) {
    return sendError(400, parsed.message);
  }

  const content = parseCreateConcertBody(parsed.body);
  if (content.ok === false) {
    return sendError(400, content.message);
  }

  const concertId = nanoid();
  const createdAt = new Date().toISOString();
  const item: SharedConcertRecord = {
    PK: sharedConcertPk(concertId),
    SK: sharedConcertMetaSk(),
    type: "SharedConcert",
    concertId,
    title: content.title,
    concertDate: content.concertDate,
    location: content.location,
    ...(content.description ? { description: content.description } : {}),
    createdAt,
    createdByUuid: uuid,
    signupCount: 0,
    version: 1,
    GSI1PK: listGsi1Pk(content.concertDate),
    GSI1SK: listGsi1Sk(content.concertDate, concertId),
  };

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(PK)",
      })
    );

    return sendResponse(
      toPublicConcert(item, isConcertOpenForSignup(item.concertDate)),
      201
    );
  } catch (err) {
    console.error("createSharedConcert failed", { concertId, err });
    const name =
      err && typeof err === "object" && "name" in err
        ? String((err as { name: unknown }).name)
        : "";
    if (name === "ConditionalCheckFailedException") {
      return sendError(409, "Could not create concert due to a write conflict. Please try again.");
    }
    return sendError(500, "Failed to create shared concert.");
  }
};
