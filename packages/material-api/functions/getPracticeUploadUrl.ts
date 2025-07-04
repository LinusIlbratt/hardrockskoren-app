import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";

// Denna funktion behöver ingen Cognito- eller DynamoDB-koppling,
// eftersom behörigheten hanteras av din centrala authorizer.
const s3Client = new S3Client({ region: "eu-north-1" });

const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!BUCKET_NAME) {
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error." }) };
  }

  try {
    // Behörighetskontroll sker i authorizer.ts. Vi litar på att bara admin kan anropa.

    const body = event.body ? JSON.parse(event.body) : {};
    const fileName = body.fileName;

    if (!fileName) {
      return { statusCode: 400, headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ message: "fileName is required." }) };
    }
    
    // --- HÄR ÄR DEN ENDA VIKTIGA ÄNDRINGEN ---
    // Filen sparas nu i "sjungupp/"-mappen istället för "materials/".
    const key = `practice/${randomUUID()}-${fileName}`;

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