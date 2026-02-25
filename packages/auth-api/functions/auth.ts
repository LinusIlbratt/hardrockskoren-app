import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  CognitoIdentityProviderClient,
  AdminInitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { GetItemCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const db = new DynamoDBClient();
const cognito = new CognitoIdentityProviderClient(); 

export const loginHandler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    if (!event.body || typeof event.body !== "string") {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Request body is required" }),
      };
    }

    const body = JSON.parse(event.body);
    const email = body?.email;
    const password = body?.password;

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Email and password are required" }),
      };
    }

    const mainTable = process.env.MAIN_TABLE;
    if (!mainTable) {
      console.error("Login: MAIN_TABLE is not set");
      return {
        statusCode: 503,
        body: JSON.stringify({ message: "Server configuration error" }),
      };
    }

    const result = await db.send(new GetItemCommand({
        TableName: mainTable,
        Key: marshall({
          PK: 'TENANT#hrk',
          SK: 'SETTINGS'
        })
      }));

    const item = result.Item;
    if (!item) {
      console.error("Login: TENANT#hrk SETTINGS not found in database");
      return {
        statusCode: 503,
        body: JSON.stringify({ message: "Server configuration error" }),
      };
    }

    const { userPoolId, clientId } = unmarshall(item).settings?.userPool ?? {};
    if (!userPoolId || !clientId) {
      console.error("Login: userPoolId/clientId missing in SETTINGS");
      return {
        statusCode: 503,
        body: JSON.stringify({ message: "Server configuration error" }),
      };
    }

      const command = new AdminInitiateAuthCommand({
        AuthFlow: "ADMIN_NO_SRP_AUTH",
        ClientId: clientId,
        UserPoolId: userPoolId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

    const response = await cognito.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({
        accessToken: response.AuthenticationResult?.AccessToken
      }),
    };
  } catch (error: any) {
    console.error("Login error", error);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Invalid email or password" }),
    };
  }
};
