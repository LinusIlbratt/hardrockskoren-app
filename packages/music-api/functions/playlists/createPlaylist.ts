import middy from "@middy/core";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { nanoid } from "nanoid";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { sendResponse, sendError } from "@hrk/core/utils/http";
import type { AuthContext } from "@hrk/core/types";

type AuthorizedEvent = APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>;

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

export type PlaylistResponse = {
  entityType: "PLAYLIST";
  playlistId: string;
  title: string;
  description?: string;
  createdAt: string;
};

export const handler = middy<AuthorizedEvent, APIGatewayProxyResultV2>().handler(
  async (event): Promise<APIGatewayProxyResultV2> => {
    const tableName = process.env.MAIN_TABLE;
    if (!tableName) {
      console.error("createPlaylist: MAIN_TABLE is not configured.");
      return sendError(500, "Server configuration error.");
    }

    const uuid = event.requestContext.authorizer.lambda?.uuid?.trim();
    if (!uuid) {
      return sendError(401, "User identity is missing from the request context.");
    }

    if (!event.body?.trim()) {
      return sendError(400, "Request body is required.");
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(event.body) as Record<string, unknown>;
    } catch {
      return sendError(400, "Invalid JSON body.");
    }

    const titleRaw = body.title;
    if (typeof titleRaw !== "string" || titleRaw.trim() === "") {
      return sendError(400, "title is required and must be a non-empty string.");
    }
    const title = titleRaw.trim();

    let description: string | undefined;
    if (body.description !== undefined && body.description !== null) {
      if (typeof body.description !== "string") {
        return sendError(400, "description must be a string when provided.");
      }
      const d = body.description.trim();
      if (d !== "") {
        description = d;
      }
    }

    const playlistId = nanoid();
    const createdAt = new Date().toISOString();
    const PK = `USER#${uuid}`;
    const SK = `PLAYLIST#${playlistId}`;

    const item: Record<string, unknown> = {
      PK,
      SK,
      entityType: "PLAYLIST",
      playlistId,
      title,
      createdAt,
    };
    if (description !== undefined) {
      item.description = description;
    }

    const responsePayload: PlaylistResponse = {
      entityType: "PLAYLIST",
      playlistId,
      title,
      createdAt,
    };
    if (description !== undefined) {
      responsePayload.description = description;
    }

    try {
      await docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
        })
      );

      return sendResponse(responsePayload, 201);
    } catch (err) {
      console.error("createPlaylist: DynamoDB PutCommand failed.", err);
      return sendError(500, "Could not create playlist.");
    }
  }
);
