// packages/admin-api/functions/user/update.ts

import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { AuthContext, RoleTypes } from "../../../core/types";
import { cognito } from "../../../core/services/cognito";
import { sendResponse, sendError } from "../../../core/utils/http";
import {
  normalizeGroupSlug,
  requireGroupAccessResponse,
} from "../../../core/utils/requireGroupAccess";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const USER_POOL_ID = process.env.USER_POOL_ID;

/**
 * Roller som får tilldelas via detta API. `admin` är medvetet utesluten —
 * plattformsbehörighet sätts manuellt i AWS-konsolen så att en körledare inte
 * kan eskalera sig själv eller någon annan.
 */
const ASSIGNABLE_ROLES = ["leader", "user"] as const;

type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

function isAssignableRole(value: unknown): value is AssignableRole {
  return typeof value === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

export const handler = async (
  event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
): Promise<APIGatewayProxyResultV2> => {
  if (!USER_POOL_ID) {
    console.error("updateUserRole: USER_POOL_ID is not set.");
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
  let role: unknown;
  try {
    ({ email, role } = JSON.parse(event.body));
  } catch {
    return sendError(400, "Ogiltigt JSON-format i request body.");
  }

  if (typeof email !== "string" || email.trim() === "") {
    return sendError(400, "E-postadress för användaren krävs.");
  }
  const username = email.trim();

  if (!isAssignableRole(role)) {
    return sendError(
      400,
      `Ogiltig roll. Tillåtna värden är: ${ASSIGNABLE_ROLES.join(", ")}.`
    );
  }
  const newRole: AssignableRole = role;

  try {
    // Målanvändarens nuvarande roll — en admin får inte degraderas via detta API.
    const { UserAttributes } = await cognito.adminGetUser({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });
    const currentRole = (UserAttributes ?? []).find((a) => a.Name === "custom:role")?.Value as
      | RoleTypes
      | undefined;

    if (currentRole === "admin") {
      return sendError(403, "Administratörers roll kan inte ändras via detta API.");
    }

    // Målanvändaren måste faktiskt vara medlem i kören som anges i sökvägen,
    // annars kan en körledare ändra roll på medlemmar i andra körer.
    const { Groups } = await cognito.adminListGroupsForUser({
      UserPoolId: USER_POOL_ID,
      Username: username,
    });
    const isMemberOfGroup = (Groups ?? []).some((g) => g.GroupName?.trim() === groupSlug);

    if (!isMemberOfGroup) {
      return sendError(404, `Användaren ${username} är inte medlem i kören ${groupSlug}.`);
    }

    await cognitoClient.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: [{ Name: "custom:role", Value: newRole }],
      })
    );

    return sendResponse(
      { message: `Rollen för ${username} har uppdaterats till ${newRole}.` },
      200
    );
  } catch (error: any) {
    if (error?.name === "UserNotFoundException") {
      return sendError(404, `Ingen användare med e-postadressen ${username} hittades.`);
    }

    console.error("updateUserRole: failed to update role", error);
    return sendError(500, "Kunde inte uppdatera användarens roll.");
  }
};
