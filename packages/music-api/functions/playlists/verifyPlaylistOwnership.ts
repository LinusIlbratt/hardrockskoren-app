import {
  GetCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

/**
 * Verifierar att spellistan finns under användarens partition (USER#{uuid} / PLAYLIST#{playlistId}).
 */
export async function verifyPlaylistOwnership(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  userUuid: string,
  playlistId: string
): Promise<boolean> {
  const PK = `USER#${userUuid}`;
  const SK = `PLAYLIST#${playlistId}`;

  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK, SK },
      ConsistentRead: true,
    })
  );

  if (!result.Item) {
    return false;
  }
  if (result.Item.entityType !== "PLAYLIST") {
    return false;
  }
  return true;
}
