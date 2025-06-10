import { decomposeUnverifiedJwt } from "aws-jwt-verify/jwt";
import type { AttributeType } from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";

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

// Creates a verifier from a token (based on clientId/userPoolId in payload)
export const createVerifierFromUnverifiedToken = (
  token: string
): {
  clientId: string;
  userPoolId: string;
  verifier: ReturnType<typeof CognitoJwtVerifier.create>;
} => {
  const { clientId, userPoolId } = getUserPoolFromUnverifiedToken(token);

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
  group?: string; 
} => {
  if (!userAttributes) {
    return {};
  }

  const find = (name: string) =>
    userAttributes.find((attr) => attr.Name === name)?.Value;

  return {
    role: find("custom:role"),
    group: find("custom:group"),
  };
};

