import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const INVITE_TABLE = process.env.INVITE_TABLE;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  try {
    const { inviteId } = event.pathParameters || {};
    if (!inviteId) {
      return sendError(400, "Invite ID is required.");
    }

    const command = new GetItemCommand({
      TableName: INVITE_TABLE,
      Key: { inviteId: { S: inviteId } },
    });

    const { Item } = await dbClient.send(command);

    if (!Item) {
      return sendError(404, "Invite not found or has expired.");
    }

    const invite = unmarshall(Item);
    // Skicka inte tillbaka all information, bara det som behövs
    return sendResponse({ email: invite.email, groupName: invite.groupName });

  } catch (error: any) {
    console.error("Error getting invite:", error);
    return sendError(500, error.message);
  }
};