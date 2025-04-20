import {
    CognitoIdentityProviderClient,
    AdminGetUserCommand,
    AdminListGroupsForUserCommand,
  } from "@aws-sdk/client-cognito-identity-provider";
  
  const client = new CognitoIdentityProviderClient({});
  
  export const cognito = {
    adminGetUser: async (params: { UserPoolId: string; Username: string }) => {
      const command = new AdminGetUserCommand(params);
      return client.send(command);
    },
  
    adminListGroupsForUser: async (params: { UserPoolId: string; Username: string }) => {
      const command = new AdminListGroupsForUserCommand(params);
      return client.send(command);
    },
  };
  