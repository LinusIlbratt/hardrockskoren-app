import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { AuthContext } from "../../../core/types";
import { sendResponse, sendError } from "../../../core/utils/http";
import {
  normalizeGroupSlug,
  requireGroupAccessResponse,
} from "../../../core/utils/requireGroupAccess";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const USER_POOL_ID = process.env.USER_POOL_ID;
const MAIN_TABLE = process.env.MAIN_TABLE;

/** Cognito-grupp som inte är en kör. Medlemskap här får aldrig utlösa AdminDeleteUser. */
const PLATFORM_GROUP = "admin";

export const handler = async (
  event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
): Promise<APIGatewayProxyResultV2> => {
  if (!USER_POOL_ID || !MAIN_TABLE) {
    console.error("deleteUserFromGroup: USER_POOL_ID or MAIN_TABLE is not set.");
    return sendError(500, "Serverkonfigurationen är ofullständig.");
  }
  if (!event.body) {
    return sendError(400, "Request body saknas.");
  }

  const groupSlug = normalizeGroupSlug(event.pathParameters?.groupSlug);
  if (!groupSlug) {
    return sendError(400, "Kör-slug saknas i URL:en.");
  }

  const lambdaContext = event.requestContext.authorizer?.lambda;

  // Körledare får bara röra sin egen kör. Admin passerar.
  const accessError = await requireGroupAccessResponse(lambdaContext, groupSlug);
  if (accessError) {
    return accessError;
  }

  let email: unknown;
  try {
    ({ email } = JSON.parse(event.body));
  } catch {
    return sendError(400, "Ogiltigt JSON-format i request body.");
  }

  if (typeof email !== "string" || email.trim() === "") {
    return sendError(400, "E-postadress för användaren krävs.");
  }
  const username = email.trim();
  if (username.length > 254 || username.includes("#") || /[\u0000-\u001F]/.test(username)) {
    return sendError(400, "Ogiltig e-postadress.");
  }

  try {
    const groupNames = await listGroupNames(username);
    if (groupNames === null) {
      await deleteChoirUserLink(groupSlug, username);
      return deletedResponse();
    }

    const choirGroups = groupNames.filter((name) => name !== PLATFORM_GROUP);
    if (!choirGroups.includes(groupSlug)) {
      return sendError(404, `Användaren ${username} är inte medlem i kören ${groupSlug}.`);
    }

    const belongsToAnotherChoir = choirGroups.some((name) => name !== groupSlug);
    if (belongsToAnotherChoir) {
      await removeFromChoirOnly(username, groupSlug);
      return sendResponse(
        { success: true, message: "Användaren har tagits bort från kören." },
        200
      );
    }

    if (groupNames.includes(PLATFORM_GROUP)) {
      return sendError(403, "Administratörens konto kan inte raderas via detta API.");
    }

    try {
      await cognitoClient.send(
        new AdminDeleteUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
        })
      );
    } catch (error: unknown) {
      if (!isUserNotFound(error)) {
        throw error;
      }
    }
    await deleteChoirUserLink(groupSlug, username);

    return deletedResponse();
  } catch (error: unknown) {
    console.error("deleteUserFromGroup failed", error);
    return sendError(500, "Kunde inte ta bort användaren från kören.");
  }
};

/** Tar bort kör-medlemskapet och länkraden. Cognito-kontot lämnas kvar. */
async function removeFromChoirOnly(username: string, groupSlug: string): Promise<void> {
  try {
    await cognitoClient.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        GroupName: groupSlug,
      })
    );
  } catch (error: unknown) {
    if (!isUserNotFound(error)) {
      throw error;
    }
  }
  await deleteChoirUserLink(groupSlug, username);
}

/** Legacy-raden GROUP#{slug} / USER#{email} som inbjudan och kontoskapande skriver. */
async function deleteChoirUserLink(groupSlug: string, email: string): Promise<void> {
  await dbClient.send(
    new DeleteItemCommand({
      TableName: MAIN_TABLE,
      Key: {
        PK: { S: `GROUP#${groupSlug}` },
        SK: { S: `USER#${email}` },
      },
    })
  );
}

function deletedResponse() {
  return sendResponse({ success: true, message: "User deleted successfully" }, 200);
}

function isUserNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === "UserNotFoundException";
}

/** Gruppnamn för användaren. `null` om kontot redan saknas i Cognito. */
async function listGroupNames(username: string): Promise<string[] | null> {
  const names: string[] = [];
  let nextToken: string | undefined;

  try {
    do {
      const listed = await cognitoClient.send(
        new AdminListGroupsForUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          NextToken: nextToken,
          Limit: 60,
        })
      );
      for (const group of listed.Groups ?? []) {
        const name = group.GroupName?.trim();
        if (name) {
          names.push(name);
        }
      }
      nextToken = listed.NextToken;
    } while (nextToken);
  } catch (error: unknown) {
    if (isUserNotFound(error)) {
      return null;
    }
    throw error;
  }

  return names;
}
