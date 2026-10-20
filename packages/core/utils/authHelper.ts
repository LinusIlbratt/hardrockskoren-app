import { decomposeUnverifiedJwt } from "aws-jwt-verify/jwt";
import type { AttributeType } from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";

/**
 * Förväntad Cognito User Pool för aktuell stage.
 * Kräver strikt EXPECTED_USER_POOL_ID — ingen fallback till andra env-variabler.
 */
export function getExpectedUserPoolId(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const raw = env.EXPECTED_USER_POOL_ID?.trim() || "";
  return raw.length > 0 ? raw : null;
}

/**
 * Neka tokens från annan stage/pool (t.ex. prod-token mot dev-authorizer).
 * Kastar om poolen inte matchar eller om EXPECTED_USER_POOL_ID saknas i miljön.
 */
export function assertTokenUserPoolAllowed(
  tokenUserPoolId: string,
  env: NodeJS.ProcessEnv = process.env
): void {
  const expected = getExpectedUserPoolId(env);
  if (!expected) {
    throw new Error("EXPECTED_USER_POOL_ID is not configured.");
  }
  const actual = tokenUserPoolId?.trim() ?? "";
  if (!actual || actual !== expected) {
    throw new Error(
      `Token user pool mismatch: token=${actual || "(empty)"} expected=${expected}`
    );
  }
}

// Extracts clientId and userPoolId from an unverified token
export const getUserPoolFromUnverifiedToken = (
  token: string
): {
  clientId: string;
  userPoolId: string;
} => {
  const {
    payload: { client_id, iss },
  } = decomposeUnverifiedJwt(token);

  if (!client_id || !iss) {
    throw new Error("Invalid token - missing client_id or iss");
  }

  const userPoolId = iss.split("/").pop();

  return {
    clientId: String(client_id),
    userPoolId: String(userPoolId),
  };
};

/**
 * Skapar JWT-verifierare från token. Neka om tokenens userPoolId
 * inte matchar stagens EXPECTED_USER_POOL_ID (fail-closed).
 */
export const createVerifierFromUnverifiedToken = (
  token: string
): {
  clientId: string;
  userPoolId: string;
  verifier: ReturnType<typeof CognitoJwtVerifier.create>;
} => {
  const { clientId, userPoolId } = getUserPoolFromUnverifiedToken(token);
  assertTokenUserPoolAllowed(userPoolId);

  return {
    clientId,
    userPoolId,
    verifier: CognitoJwtVerifier.create({
      clientId,
      userPoolId,
      tokenUse: "access",
    }),
  };
};

export const getUserDetailsFromAttributes = (
  userAttributes?: AttributeType[]
): {
  role?: string;
  given_name?: string;
  family_name?: string;
} => {
  if (!userAttributes) {
    return {};
  }

  const find = (name: string) =>
    userAttributes.find((attr) => attr.Name === name)?.Value;

  return {
    role: find("custom:role"),
    given_name: find("given_name") || undefined,
    family_name: find("family_name") || undefined,
  };
};

