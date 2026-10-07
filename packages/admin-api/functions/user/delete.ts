import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
  AdminListGroupsForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
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

const USER_POOL_ID = process.env.USER_POOL_ID;

export const handler = async (
  event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
): Promise<APIGatewayProxyResultV2> => {
  if (!USER_POOL_ID) {
    console.error("deleteUserFromGroup: USER_POOL_ID is not set.");
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

  try {
    const groupNames = await listGroupNames(username);
    if (groupNames === null) {
      return deletedResponse();
    }
    if (groupNames.includes("admin")) {
      return sendError(403, "Administratörens konto kan inte raderas via detta API.");
    }
    if (!groupNames.includes(groupSlug)) {
      return sendError(404, `Användaren ${username} är inte medlem i kören ${groupSlug}.`);
    }

    try {
      await cognitoClient.send(
        new AdminDeleteUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
        })
      );
    } catch (error: unknown) {
      if (isUserNotFound(error)) {
        return deletedResponse();
      }
      throw error;
    }

    return deletedResponse();
  } catch (error: unknown) {
    console.error("deleteUserFromGroup: AdminDeleteUser failed", error);
    return sendError(500, "Kunde inte radera användaren.");
  }
};

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
