import middy from "@middy/core";
import {
  APIGatewayProxyEventV2,
  APIGatewaySimpleAuthorizerWithContextResult,
} from "aws-lambda";
import { AuthContext, RoleTypes } from "../../../core/types";
import {
  createVerifierFromUnverifiedToken,
  getUserDetailsFromAttributes,
} from "../../../core/utils/authHelper";
import { cognito } from "../../../core/services/cognito";
import { routePermissions } from "../../../core/utils/permissions";

export const handler = middy()
  .handler(
    async (
      event: APIGatewayProxyEventV2
    ): Promise<APIGatewaySimpleAuthorizerWithContextResult<AuthContext>> => {
      
      // Tillåt alltid OPTIONS-anrop för CORS pre-flight checks
      if (event.requestContext.http.method === 'OPTIONS') {
        return { isAuthorized: true, context: {} as AuthContext };
      }

      // 1. AUTENTISERING: Verifiera att en giltig token finns
      // -------------------------------------------------------------
      if (!event.headers.authorization) {
        console.warn("No authorization header found.");
        return { isAuthorized: false, context: null };
      }

      const TOKEN = event.headers.authorization.replace("Bearer ", "");

      try {
        // Verifiera token och hämta användarinformation
        const { verifier, clientId, userPoolId } = createVerifierFromUnverifiedToken(TOKEN);
        const payload = await verifier.verify(TOKEN);

        const { UserAttributes } = await cognito.adminGetUser({
          UserPoolId: userPoolId,
          Username: payload.sub,
        });

        const { role } = getUserDetailsFromAttributes(UserAttributes);
        const userRole: RoleTypes = (role as RoleTypes) || "user"; // Sätt 'user' som standardroll

        
        // 2. AUKTORISERING: Kontrollera om användarens roll är tillåten för denna endpoint
        // --------------------------------------------------------------------------------
        const routeKey = event.routeKey; // Ex: "DELETE /groups/{groupSlug}/users"
        const requiredRoles = routePermissions[routeKey];

        // Om endpointen inte finns i vår konfiguration, neka åtkomst för säkerhets skull.
        if (!requiredRoles) {
          console.warn(`SECURITY: No permissions defined for route: ${routeKey}. Denying access by default.`);
          return { isAuthorized: false, context: null };
        }

        // Kontrollera om användarens roll finns i listan över tillåtna roller.
        if (!requiredRoles.includes(userRole)) {
          console.warn(`FORBIDDEN: User with role '${userRole}' is not authorized for route: ${routeKey}`);
          return { isAuthorized: false, context: null };
        }
        
        // Om vi kommer hit är användaren både autentiserad OCH auktoriserad.
        const context: AuthContext = {
          uuid: payload.sub,
          role: userRole,
          clientId,
          userPoolId,
        };

        return {
          isAuthorized: true,
          context,
        };

      } catch (error) {
        // Detta block fångar fel som en ogiltig eller utgången token.
        console.error("Authorization failed (token validation error):", error);
        return { isAuthorized: false, context: null };
      }
    }
  );