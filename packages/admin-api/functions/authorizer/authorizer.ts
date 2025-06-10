import middy from "@middy/core";
import {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from "aws-lambda";
import { AuthContext, RoleTypes } from "../../../core/types";
import {
  createVerifierFromUnverifiedToken,
  getUserDetailsFromAttributes,
} from "../../../core/utils/authHelper";
import { cognito } from "../../../core/services/cognito";

export const handler = middy()
  .handler(
    async (
      event: APIGatewayRequestAuthorizerEventV2
    ): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthContext>> => {
      if (!event.headers.authorization) {
        return { isAuthorized: false, context: null };
      }

      const TOKEN = event.headers.authorization.replace("Bearer ", "");

      try {
        const { verifier, clientId, userPoolId } = createVerifierFromUnverifiedToken(TOKEN);
        const payload = await verifier.verify(TOKEN);

        const { UserAttributes } = await cognito.adminGetUser({
          UserPoolId: userPoolId,
          Username: payload.sub,
        });

        const { role, group } = getUserDetailsFromAttributes(UserAttributes);

        const context: AuthContext = {
          uuid: payload.sub,
          role: (role as RoleTypes) || "user",
          group: group || null, 
          clientId,
          userPoolId,
        };
        
        return {
          isAuthorized: true,
          context,
        };

      } catch (error) {
        console.error("Authorization failed:", error);
        return { isAuthorized: false, context: null };
      }
    }
  );
