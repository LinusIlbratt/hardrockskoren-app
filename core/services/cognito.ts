import {
    CognitoIdentityProviderClient,
    AdminGetUserCommand,
    AdminListGroupsForUserCommand,
    AdminSetUserPasswordCommand,
    ChangePasswordCommand,
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

    adminSetUserPassword: async (params: {
      UserPoolId: string;
      Username: string;
      Password: string;
      Permanent: boolean;
    }) => {
      const command = new AdminSetUserPasswordCommand(params);
      return client.send(command);
    },

    changePassword: async (params: {
      AccessToken: string;
      PreviousPassword: string;
      ProposedPassword: string;
    }) => {
      const command = new ChangePasswordCommand(params);
      return client.send(command);
    }
  };
  