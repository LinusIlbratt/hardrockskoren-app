import middy from "@middy/core";
import {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from "aws-lambda";
import { AuthContext, RoleTypes } from "../../../core/types";
import {
  createVerifierFromUnverifiedToken,
  getRoleFromUserAttributes,
} from "../../../core/utils/authHelper";
import { cognito } from "../../../core/services/cognito";

export const handler = middy()
  .handler(
    async (
      event: APIGatewayRequestAuthorizerEventV2
    ): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthContext>> => {
      if (!event.headers.authorization) {
        return {
          isAuthorized: false,
          context: null,
        };
      }

      const TOKEN = event.headers.authorization.replace("Bearer ", "");

      try {
        // create verifierer and pool from token 
        const { verifier, clientId, userPoolId } = createVerifierFromUnverifiedToken(TOKEN);

        // Verify token
        const payload = await verifier.verify(TOKEN);

        // Get user and attributes from Cognito
        const { UserAttributes } = await cognito.adminGetUser({
          UserPoolId: userPoolId,
          Username: payload.sub,
        });

        // Extract role from attribute 
        const { role } = getRoleFromUserAttributes(UserAttributes);

        const context: AuthContext = {
          uuid: payload.sub,
          role: (role as RoleTypes) || "user",
          clientId,
          userPoolId,
        };

        return {
          isAuthorized: true,
          context,
        };
      } catch (error) {
        console.error("Authorization failed:", error);
        return {
          isAuthorized: false,
          context: null,
        };
      }
    }
  );
