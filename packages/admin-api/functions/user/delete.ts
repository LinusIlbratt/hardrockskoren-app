import {
  CognitoIdentityProviderClient,
  AdminRemoveUserFromGroupCommand,
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
    // Plockar bort medlemmen ur kören. Kontot, övriga körer, spellistor och
    // favoriter finns kvar — permanent radering görs inte via detta API.
    await cognitoClient.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        GroupName: groupSlug,
      })
    );

    return sendResponse(
      { message: `Användaren ${username} har tagits bort från kören ${groupSlug}.` },
      200
    );
  } catch (error: any) {
    if (error?.name === "UserNotFoundException") {
      return sendError(404, `Ingen användare med e-postadressen ${username} hittades.`);
    }
    if (error?.name === "ResourceNotFoundException") {
      return sendError(404, `Kören ${groupSlug} hittades inte.`);
    }

    console.error("deleteUserFromGroup: AdminRemoveUserFromGroup failed", error);
    return sendError(500, "Kunde inte ta bort användaren från kören.");
  }
};
