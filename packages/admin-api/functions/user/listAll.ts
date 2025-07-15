import {
    CognitoIdentityProviderClient,
    ListUsersCommand, // Vi använder ListUsers istället för ListUsersInGroup
    UserType
} from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEventV2WithLambdaAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { AuthContext } from "../../../core/types";
import { sendResponse, sendError } from "../../../core/utils/http";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const USER_POOL_ID = process.env.USER_POOL_ID;

export const handler = async (
    event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
): Promise<APIGatewayProxyResultV2> => {
    if (!USER_POOL_ID) {
        return sendError(500, "Server configuration error: User Pool ID not set.");
    }

    try {

        const invokerRole = event.requestContext.authorizer.lambda.role;
        if (invokerRole !== "admin") {
            return sendError(403, "Forbidden: You do not have permission do list all users.");
        }

        let allUsers: UserType[] = [];
        let paginationToken: string | undefined = undefined;

        // STEG 1: Loopa för att hämta alla sidor med användare
        // En do...while-loop säkerställer att vi gör minst ett anrop.
        do {
            const command = new ListUsersCommand({
                UserPoolId: USER_POOL_ID,
                // Skicka med token från föregående anrop för att hämta nästa sida
                PaginationToken: paginationToken,
            });

            const response = await cognitoClient.send(command);

            // Lägg till de hämtade användarna i vår lista
            if (response.Users) {
                allUsers.push(...response.Users);
            }

            // Uppdatera token för nästa varv i loopen
            paginationToken = response.PaginationToken;

        } while (paginationToken); // Fortsätt så länge Cognito skickar en token

        // STEG 2: Formatera den kompletta listan av användare
        const formattedUsers = allUsers.map(user => {
            const attributeMap = (user.Attributes || []).reduce((acc, attr) => {
                if (attr.Name && attr.Value) {
                    acc[attr.Name] = attr.Value;
                }
                return acc;
            }, {} as Record<string, string>);

            return {
                id: user.Username,
                email: attributeMap['email'],
                given_name: attributeMap['given_name'],
                family_name: attributeMap['family_name'],
                role: attributeMap['custom:role'],
                status: user.UserStatus,
                created: user.UserCreateDate,
                lastModified: user.UserLastModifiedDate,
            };
        });

        // Skicka tillbaka den fullständiga, formaterade listan
        return sendResponse({ users: formattedUsers }, 200);

    } catch (error: any) {
        console.error("Error listing all users:", error);
        return sendError(500, error.message || "Internal server error");
    }
};