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
      // 1. Kontrollera att Authorization-header finns
      if (!event.headers.authorization) {
        return { isAuthorized: false, context: null };
      }

      const TOKEN = event.headers.authorization.replace("Bearer ", "");

      try {
        // 2. Verifiera token
        const { verifier, clientId, userPoolId } = createVerifierFromUnverifiedToken(TOKEN);
        const payload = await verifier.verify(TOKEN);

        // 3. Hämta användarens attribut från Cognito
        const { UserAttributes } = await cognito.adminGetUser({
          UserPoolId: userPoolId,
          Username: payload.sub,
        });

        const { role, given_name, family_name } =
          getUserDetailsFromAttributes(UserAttributes);

        // 5. Skapa det slutgiltiga context-objektet
        const context: AuthContext = {
          uuid: payload.sub,
          role: (role as RoleTypes) || "user",
          clientId,
          userPoolId,
          ...(given_name ? { given_name } : {}),
          ...(family_name ? { family_name } : {}),
        };
        
        // 6. Returnera ett godkänt svar
        return {
          isAuthorized: true,
          context,
        };

      } catch (error) {
        console.error("Authorization failed:", error);
        // 7. Returnera ett nekat svar (med context: null) vid fel
        return { isAuthorized: false, context: null };
      }
    }
  );
