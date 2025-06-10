// material-api/functions/getUploadUrl.ts

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { randomUUID } from "crypto";

const s3Client = new S3Client({ region: "eu-north-1" });
const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!BUCKET_NAME) {
    console.error("Server configuration error: Bucket name is not set.");
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Server configuration error." }),
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const fileName = body.fileName;

    if (!fileName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "fileName is required in the request body." }),
      };
    }
    
    // Skapa en unik nyckel för filen för att undvika att filer skriver över varandra
    const key = `materials/${randomUUID()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    // Generera en signerad URL som är giltig i 5 minuter (300 sekunder)
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // Justera för prod!
      },
      body: JSON.stringify({
        uploadUrl: uploadUrl,
        key: key, // Skicka tillbaka nyckeln så frontend vet var filen kommer att landa
      }),
    };
  } catch (error) {
    console.error("Error generating upload URL:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error generating upload URL." }),
    };
  }
};