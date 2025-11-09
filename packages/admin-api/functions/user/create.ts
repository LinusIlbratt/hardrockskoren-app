import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { 
  CognitoIdentityProviderClient, 
  AdminCreateUserCommand, 
  AdminSetUserPasswordCommand, 
  AdminAddUserToGroupCommand 
} from "@aws-sdk/client-cognito-identity-provider";
import { marshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../../core/utils/http"; 

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const MAIN_TABLE = process.env.MAIN_TABLE!;
const USER_POOL_ID = process.env.USER_POOL_ID!;


export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!MAIN_TABLE || !USER_POOL_ID || !event.body) {
    return sendError(500, "Server configuration or request body is missing.");
  }
  

  let groupSlug: string | undefined;

  try {
    
    const { 
      email, 
      given_name, 
      family_name, 
      password, 
      groupSlug: parsedGroupSlug, 
      role = 'user'
    } = JSON.parse(event.body);

    groupSlug = parsedGroupSlug; 

    if (!email || !given_name || !family_name || !password || !groupSlug) {
      return sendError(400, "Email, given_name, family_name, password, and groupSlug are required.");
    }
    
    if (password.length < 8 || !/(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      return sendError(400, "Password must be at least 8 characters long and contain letters and numbers.");
    }

    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email, 
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "given_name", Value: given_name },
        { Name: "family_name", Value: family_name },
        { Name: "email_verified", Value: "true" },
        { Name: "custom:role", Value: role },
      ],
      MessageAction: "SUPPRESS", 
    });

    const { User } = await cognitoClient.send(createUserCommand);
    if (!User || !User.Username) {
        throw new Error("Failed to create user in Cognito.");
    }

    const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: User.Username,
        Password: password,
        Permanent: true, 
    });
    await cognitoClient.send(setPasswordCommand);

    const addUserToGroupCmd = new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: User.Username,
        GroupName: groupSlug, 
    });
    await cognitoClient.send(addUserToGroupCmd);

   
    const userGroupLink = {
      PK: `GROUP#${groupSlug}`, 
      SK: `USER#${email}`,
      email: email,
      given_name: given_name,
      family_name: family_name,
      role: role,
      createdAt: new Date().toISOString(),
    };
    await dbClient.send(new PutItemCommand({ 
      TableName: MAIN_TABLE, 
      Item: marshall(userGroupLink) 
    }));

    return sendResponse({ message: "Admin: User created and added to group." }, 201);

  } catch (error: any) {
    if (error.name === "UsernameExistsException") {
      return sendError(409, "A user with this email already exists.");
    }
    if (error.name === "ResourceNotFoundException") {
        
        return sendError(404, `Cognito Group '${groupSlug || 'unknown'}' not found.`);
    }
    if (error instanceof SyntaxError) {
      return sendError(400, "Invalid JSON format in request body.");
    }
    console.error("Error in admin create user:", error);
    return sendError(500, error.message);
  }
};