import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { sendError } from "../../../core/utils/http";
import { cognito } from "../../../core/services/cognito";

/** Subset of authorizer context from hrk-apigateway-admin-authorizer (HTTP API lambda authorizer). */
export type LambdaAuthorizerContext = {
  uuid?: string;
  role?: string;
  userPoolId?: string;
};

function normalizeGroupSlug(raw: string | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  try {
    const t = decodeURIComponent(raw).trim();
    return t.length > 0 ? t : null;
  } catch {
    const t = String(raw).trim();
    return t.length > 0 ? t : null;
  }
}

/**
 * Ensures the caller may access data scoped to `requestedGroupSlug`.
 * - Role `admin` (Cognito custom:role): all groups (platform operator).
 * - Everyone else: must be in a Cognito User Pool group whose `GroupName` equals the slug
 *   (same membership model as auth-api `/me` → adminListGroupsForUser).
 *
 * @returns `null` if access is allowed, otherwise a JSON `{ message }` error body via sendError.
 */
export async function requireGroupAccessResponse(
  lambdaContext: LambdaAuthorizerContext | undefined,
  requestedGroupSlug: string | undefined
): Promise<APIGatewayProxyStructuredResultV2 | null> {
  const slug = normalizeGroupSlug(requestedGroupSlug);
  if (!slug) {
    return sendError(400, "Group name is required in the path.");
  }

  const uuid = typeof lambdaContext?.uuid === "string" ? lambdaContext.uuid.trim() : "";
  const userPoolId =
    typeof lambdaContext?.userPoolId === "string" ? lambdaContext.userPoolId.trim() : "";

  if (!uuid || !userPoolId) {
    return sendError(403, "Forbidden: User identity could not be verified.");
  }

  const role =
    typeof lambdaContext?.role === "string" ? lambdaContext.role.trim().toLowerCase() : "";
  if (role === "admin") {
    return null;
  }

  try {
    const { Groups } = await cognito.adminListGroupsForUser({
      UserPoolId: userPoolId,
      Username: uuid,
    });

    const memberOf = new Set(
      (Groups ?? [])
        .map((g) => g.GroupName)
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .map((n) => n.trim())
    );

    if (!memberOf.has(slug)) {
      return sendError(403, "Forbidden: You do not have access to this choir.");
    }
  } catch (err) {
    console.error("requireGroupAccessResponse: AdminListGroupsForUser failed", err);
    return sendError(403, "Forbidden: Could not verify access to this choir.");
  }

  return null;
}
