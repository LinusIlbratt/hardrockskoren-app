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
    const { email, password } = JSON.parse(event.body);

    const result = await db.send(new GetItemCommand({
        TableName: process.env.MAIN_TABLE,
        Key: marshall({
          PK: 'TENANT#hrk',
          SK: 'SETTINGS'
        })
      }));
      
      const { userPoolId, clientId } = unmarshall(result.Item!).settings.userPool;

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
