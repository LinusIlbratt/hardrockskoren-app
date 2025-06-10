import {
  APIGatewayProxyEventV2WithLambdaAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { AuthContext } from "../../core/types";
import { cognito } from "../../core/services/cognito"; // gör som tidigare
import { AttributeType } from "@aws-sdk/client-cognito-identity-provider";

export const handler = async (
  event: APIGatewayProxyEventV2WithLambdaAuthorizer<AuthContext>
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const user = event.requestContext.authorizer.lambda;

    const { UserAttributes } = await cognito.adminGetUser({
      UserPoolId: user.userPoolId,
      Username: user.uuid,
    });

    const getAttr = (key: string) =>
      UserAttributes.find((a) => a.Name === key)?.Value || null;

    const email = getAttr("email");
    const role = getAttr("custom:role");
    const givenName = getAttr("given_name");
    const familyName = getAttr("family_name");


    const { Groups } = await cognito.adminListGroupsForUser({
      UserPoolId: user.userPoolId,
      Username: user.uuid,
    });

    const groupNames = Groups?.map((g) => g.GroupName) ?? [];

    return {
      statusCode: 200,
      body: JSON.stringify({
        uuid: user.uuid,
        email,
        role,
        given_name: givenName,
        family_name: familyName,
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
