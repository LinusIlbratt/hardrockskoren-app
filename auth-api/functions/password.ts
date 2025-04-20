import middy from "@middy/core";
import {
    APIGatewayProxyEventV2WithLambdaAuthorizer,
    APIGatewayProxyStructuredResultV2
} from "aws-lambda";
import { cognito } from "../../core/services/cognito";
import { sendResponse, sendError } from "../../core/utils/http";
import { AuthContext } from "../../core/types";
import { changePasswordSchema, adminChangePasswordSchema } from "../functions/schemas"
import { validateSchema } from "../../core/middleware/validateSchema"

export const changeUserPassword = middy()
.use(validateSchema(changePasswordSchema))
.handler(
    async (
        event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
    ): Promise<APIGatewayProxyStructuredResultV2> => {
        try {
            const body = JSON.parse(event.body || "{}");
            const previousPassword = body.oldPassword?.trim();
            const proposedPassword = body.newPassword?.trim();
            const accessToken = event.headers.authorization?.replace("Bearer ", "");

            if (!previousPassword || !proposedPassword || !accessToken) {
                return sendError(400, "Missing old or new password.");
            }

            await cognito.changePassword({
                AccessToken: accessToken,
                PreviousPassword: previousPassword,
                ProposedPassword: proposedPassword,
            });

            return sendResponse({ message: "Password changed." });
        } catch (error: any) {
            console.error("User password change failed", error);
            return sendError(500, "Could not change password.");
        }
    }
);

export const changeAdminPassword = middy()
  .use(validateSchema(adminChangePasswordSchema))
  .handler(
    async (
      event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
    ): Promise<APIGatewayProxyStructuredResultV2> => {
      try {
        const { email, newPassword } = JSON.parse(event.body || "{}");

        await cognito.adminSetUserPassword({
          UserPoolId: process.env.USER_POOL_ID!,
          Username: email,
          Password: newPassword,
          Permanent: true,
        });

        return sendResponse({ message: "Password updated by admin." });
      } catch (error: any) {
        console.error("ChangeAdminPassword failed", error);
        return sendError(500, "Could not set new password.");
      }
    }
  );
