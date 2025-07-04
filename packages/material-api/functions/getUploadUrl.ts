// material-api/functions/getUploadUrl.ts

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";
// --- NYA IMPORTER ---
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const s3Client = new S3Client({ region: "eu-north-1" });
// --- NY COGNITO-KLIENT ---
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!BUCKET_NAME || !COGNITO_USER_POOL_ID) {
    console.error("Server configuration error: Bucket name or User Pool ID is not set.");
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error." }) };
  }

  try {
    // --- NYTT: Admin-kontroll på samma sätt som i din andra funktion ---
    const userId = event.requestContext.authorizer?.lambda?.uuid;
    if (!userId) {
      return { statusCode: 403, body: JSON.stringify({ message: "Forbidden: User not identifiable." }) };
    }

    const userCommand = new AdminGetUserCommand({ UserPoolId: COGNITO_USER_POOL_ID, Username: userId });
    const userResponse = await cognitoClient.send(userCommand);
    const roleAttribute = userResponse.UserAttributes?.find(attr => attr.Name === "custom:role");

    if (roleAttribute?.Value !== "admin") {
      return {
        statusCode: 403,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ message: "Forbidden: You do not have permission to perform this action." }),
      };
    }
    // --- SLUT PÅ Admin-kontroll ---


    const body = event.body ? JSON.parse(event.body) : {};
    const fileName = body.fileName;

    if (!fileName) {
      return { statusCode: 400, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ message: "fileName is required." }) };
    }
    
    const key = `materials/${randomUUID()}-${fileName}`;

    const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ uploadUrl: uploadUrl, key: key }),
    };
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return { statusCode: 500, body: JSON.stringify({ message: "Error generating upload URL." }) };
  }
};