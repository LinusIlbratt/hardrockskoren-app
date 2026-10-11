import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { AuthContext } from "../../core/types";
import { cognito } from "../../core/services/cognito";

function groupsFromContext(value: unknown): string[] | undefined {
  if (value == null) return undefined;

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      return undefined;
    }
  }

  return trimmed
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export const handler = async (
  event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const user = event.requestContext.authorizer.lambda;
    if (!user?.uuid || !user.userPoolId || !user.role) {
      console.error("Error in /me: authorizer context is incomplete");
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Could not fetch user info" }),
      };
    }

    let groupNames = groupsFromContext(user.groups);

    if (groupNames === undefined) {
      const { Groups } = await cognito.adminListGroupsForUser({
        UserPoolId: user.userPoolId,
        Username: user.uuid,
      });
      groupNames = (Groups ?? [])
        .map((group) => group.GroupName)
        .filter((name): name is string => typeof name === "string" && name.length > 0);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        uuid: user.uuid,
        email: user.email || null,
        role: user.role,
        given_name: user.given_name || null,
        family_name: user.family_name || null,
        groups: groupNames,
      }),
    };
  } catch (error) {
    console.error("Error in /me", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Could not fetch user info" }),
    };
  }
};
