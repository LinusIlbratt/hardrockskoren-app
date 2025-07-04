import middy from "@middy/core";
import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyStructuredResultV2,
  APIGatewayProxyEventV2
} from "aws-lambda";
import { cognito } from "../../core/services/cognito";
import { sendResponse, sendError } from "../../core/utils/http";
import { AuthContext } from "../../core/types";
import {
  changePasswordSchema,
  adminChangePasswordSchema,
  resetPasswordSchema,
  forgotPasswordSchema
} from "../functions/schemas"
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
        const { role } = event.requestContext.authorizer.lambda;

        if (role !== "admin") {
          return sendError(403, "Only admins can change passwords.");
        }
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

// export const forgotPassword = middy()
//   .use(validateSchema(forgotPasswordSchema))
//   .handler(
//     async (
//       event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
//     ): Promise<APIGatewayProxyStructuredResultV2> => {
//       try {
//         const { email } = JSON.parse(event.body || "{}")
//         await cognito.forgotPassword({
//           ClientId: process.env.CLIENT_ID!, // Din Cognito app client ID
//           Username: email.toLowerCase(),
//         });

//         return sendResponse({
//           message: "Password reset email sent if user exists.",
//         });
//       } catch (error: any) {
//         console.error("Forgot password failed", error);
//         return sendError(500, "Something went wrong. Try again.");
//       }
//     }
//   );

//   export const resetPassword = middy()
//   .use(validateSchema(resetPasswordSchema))
//   .handler(
//     async (
//       event: APIGatewayProxyEventV2
//     ): Promise<APIGatewayProxyStructuredResultV2> => {
//       try {
//         const { email, code, newPassword } = JSON.parse(event.body || "{}");

//         await cognito.confirmForgotPassword({
//           ClientId: process.env.CLIENT_ID!,
//           Username: email.toLowerCase(),
//           ConfirmationCode: code,
//           Password: newPassword,
//         });

//         return sendResponse({ message: "Password reset successful." });
//       } catch (error: any) {
//         console.error("Reset password failed", error);
//         return sendError(400, error.message || "Failed to reset password.");
//       }
//     }
//   );
