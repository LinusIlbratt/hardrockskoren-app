import { CognitoIdentityProviderClient, ListUsersInGroupCommand, UserType } from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../../core/types";
import { sendResponse, sendError } from "../../../core/utils/http";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const USER_POOL_ID = process.env.USER_POOL_ID;

const COGNITO_LIST_MAX = 60;
const MAX_SEARCH_PAGES = 50;

/** Läser q från queryStringParameters eller rawQueryString (HTTP API kan variera). */
function getSearchQueryParam(
  event: { queryStringParameters?: Record<string, string> | null; rawQueryString?: string }
): string {
  const fromMap = event.queryStringParameters?.q;
  if (fromMap != null && fromMap !== "") {
    return fromMap;
  }
  const raw = event.rawQueryString;
  if (!raw) {
    return "";
  }
  try {
    return new URLSearchParams(raw).get("q") ?? "";
  } catch {
    return "";
  }
}

function parseSearchTerms(raw: string): string[] {
  return raw
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

function filterUsersByInvokerRole(users: UserType[], invokerRole: string, invokerId: string): UserType[] {
  if (invokerRole !== "leader") {
    return users;
  }
  return users.filter((user) => {
    const userRole = user.Attributes?.find((attr) => attr.Name === "custom:role")?.Value;
    return userRole !== "leader" || user.Username === invokerId;
  });
}

function toAttributeMap(user: UserType): Record<string, string> {
  return (user.Attributes || []).reduce((acc, attr) => {
    if (attr.Name && attr.Value) {
      acc[attr.Name] = attr.Value;
    }
    return acc;
  }, {} as Record<string, string>);
}

function formatUser(user: UserType) {
  const attributeMap = toAttributeMap(user);
  return {
    id: user.Username,
    email: attributeMap["email"],
    given_name: attributeMap["given_name"],
    family_name: attributeMap["family_name"],
    role: attributeMap["custom:role"],
  };
}

type ListedUser = ReturnType<typeof formatUser>;

function sortListedUsersBySurname(users: ListedUser[]): ListedUser[] {
  return [...users].sort((a, b) => {
    const lnA = (a.family_name ?? "").toLocaleLowerCase("sv");
    const lnB = (b.family_name ?? "").toLocaleLowerCase("sv");
    const byLast = lnA.localeCompare(lnB, "sv", { sensitivity: "base" });
    if (byLast !== 0) return byLast;
    const fnA = (a.given_name ?? "").toLocaleLowerCase("sv");
    const fnB = (b.given_name ?? "").toLocaleLowerCase("sv");
    const byFirst = fnA.localeCompare(fnB, "sv", { sensitivity: "base" });
    if (byFirst !== 0) return byFirst;
    return (a.email ?? "").localeCompare(b.email ?? "", "sv", { sensitivity: "base" });
  });
}

function userMatchesSearchTerms(user: UserType, terms: string[]): boolean {
  if (terms.length === 0) {
    return true;
  }
  const attributeMap = toAttributeMap(user);
  const fullName = `${attributeMap["given_name"] || ""} ${attributeMap["family_name"] || ""}`.toLowerCase().trim();
  const email = (attributeMap["email"] || "").toLowerCase();
  return terms.every((term) => fullName.includes(term) || email.includes(term));
}

export const handler = async (
  event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
): Promise<APIGatewayProxyResultV2> => {
  if (!USER_POOL_ID) {
    return sendError(500, "Server configuration error: User Pool ID not set.");
  }

  try {
    const { groupName } = event.pathParameters || {};
    if (!groupName) {
      return sendError(400, "Group name is required in the path.");
    }

    const invokerRole = event.requestContext.authorizer.lambda.role;
    const invokerId = event.requestContext.authorizer.lambda.uuid;

    const rawQ = getSearchQueryParam(event).slice(0, 200);
    const searchTerms = parseSearchTerms(rawQ);

    if (searchTerms.length > 0) {
      const matches: UserType[] = [];
      let paginationToken: string | undefined;
      let pages = 0;

      do {
        const command = new ListUsersInGroupCommand({
          UserPoolId: USER_POOL_ID,
          GroupName: groupName,
          Limit: COGNITO_LIST_MAX,
          NextToken: paginationToken,
        });
        const response = await cognitoClient.send(command);
        const pageUsers = response.Users || [];
        const visible = filterUsersByInvokerRole(pageUsers, invokerRole, invokerId);
        for (const user of visible) {
          if (userMatchesSearchTerms(user, searchTerms)) {
            matches.push(user);
          }
        }
        paginationToken = response.NextToken;
        pages += 1;
      } while (paginationToken && pages < MAX_SEARCH_PAGES);

      return sendResponse(
        {
          users: sortListedUsersBySurname(matches.map(formatUser)),
        },
        200
      );
    }

    const limitRaw = parseInt(event.queryStringParameters?.limit || "25", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(COGNITO_LIST_MAX, Math.max(1, limitRaw)) : 25;
    const nextToken = event.queryStringParameters?.nextToken;

    const command = new ListUsersInGroupCommand({
      UserPoolId: USER_POOL_ID,
      GroupName: groupName,
      Limit: limit,
      NextToken: nextToken,
    });

    const response = await cognitoClient.send(command);
    const usersForPage = response.Users || [];
    const usersToFormat = filterUsersByInvokerRole(usersForPage, invokerRole, invokerId);
    const formattedUsers = usersToFormat.map(formatUser);

    return sendResponse(
      {
        users: formattedUsers,
        nextToken: response.NextToken,
      },
      200
    );
  } catch (error: any) {
    if (error.name === "ResourceNotFoundException") {
      return sendError(404, `Group with name '${event.pathParameters?.groupName}' not found.`);
    }
    console.error("Error listing users in group:", error);
    return sendError(500, error.message || "Internal server error");
  }
};
