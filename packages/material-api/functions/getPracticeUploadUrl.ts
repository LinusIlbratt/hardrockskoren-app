import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";
import { rejectedUploadFileName, sanitizeUploadFileName } from "./lib/uploadFileName";

const s3Client = new S3Client({ region: "eu-north-1" });

const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!BUCKET_NAME) {
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error." }) };
  }

  try {
    const callerRole = event.requestContext.authorizer?.lambda?.role;
    if (typeof callerRole !== "string" || callerRole.trim() !== "admin") {
      return {
        statusCode: 403,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ message: "Forbidden: You do not have permission to perform this action." }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const parsedName = sanitizeUploadFileName(body.fileName);
    if (rejectedUploadFileName(parsedName)) {
      return { statusCode: 400, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ message: parsedName.message }) };
    }

    const key = `practice/${randomUUID()}-${parsedName.fileName}`;

    const command = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    // Inkludera CORS-headers i svaret
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ uploadUrl: uploadUrl, key: key }),
    };
  } catch (error) {
    console.error("Error generating Sjungupp upload URL:", error);
    return { statusCode: 500, body: JSON.stringify({ message: "Error generating upload URL." }) };
  }
};