import type { TransactWriteCommandInput } from "@aws-sdk/lib-dynamodb";
import {
  concertSignupRefSk,
  META_CANCEL_SIGNUP_CONDITION,
  META_CANCEL_SIGNUP_NAMES,
  metaOpenForSignupValues,
  sharedConcertMetaSk,
  sharedConcertPk,
} from "./keys";

type TransactItem = NonNullable<
  TransactWriteCommandInput["TransactItems"]
>[number];

/**
 * DELETE /shared-concerts/{id}/signups
 * TransactWrite: optional Delete SIGNUPREF, Delete the caller's signup row,
 * Update META ADD signupCount -1.
 * Identity is the authorizer uuid already resolved into these arguments.
 */
export function cancelSignupTransactItems(args: {
  tableName: string;
  concertId: string;
  userUuid: string;
  signupSk: string;
  deleteRef: boolean;
  now?: Date;
}): TransactItem[] {
  const pk = sharedConcertPk(args.concertId);
  const open = metaOpenForSignupValues(args.now ?? new Date());
  const items: TransactItem[] = [];

  if (args.deleteRef) {
    items.push({
      Delete: {
        TableName: args.tableName,
        Key: { PK: pk, SK: concertSignupRefSk(args.userUuid) },
        ConditionExpression: "attribute_exists(SK)",
      },
    });
  }

  items.push({
    Delete: {
      TableName: args.tableName,
      Key: { PK: pk, SK: args.signupSk },
      ConditionExpression: "attribute_exists(SK) AND userUuid = :uuid",
      ExpressionAttributeValues: { ":uuid": args.userUuid },
    },
  });

  items.push({
    Update: {
      TableName: args.tableName,
      Key: { PK: pk, SK: sharedConcertMetaSk() },
      UpdateExpression: "ADD signupCount :minusOne",
      ConditionExpression: META_CANCEL_SIGNUP_CONDITION,
      ExpressionAttributeNames: { ...META_CANCEL_SIGNUP_NAMES },
      ExpressionAttributeValues: {
        ":concertType": open[":concertType"],
        ":today": open[":today"],
        ":deleting": open[":deleting"],
        ":one": 1,
        ":minusOne": -1,
      },
    },
  });

  return items;
}
