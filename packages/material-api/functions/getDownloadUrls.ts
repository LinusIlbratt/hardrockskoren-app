import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const BUCKET_NAME = process.env.MEDIA_BUCKET_NAME;
const MAX_KEYS = 50;
const EXPIRES_IN_SECONDS = 3600;

/** Allowed S3 prefixes for choir media (matches upload paths). */
const ALLOWED_KEY = /^(materials|practice)\/[^/\\][^\\]*$/;

function isValidFileKey(key: string): boolean {
  if (!key || key.length > 1024) return false;
  if (key.includes("..")) return false;
  if (key.startsWith("/")) return false;
  return ALLOWED_KEY.test(key);
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResultV2> => {
  if (!BUCKET_NAME) {
    return sendError(500, "Server configuration error: media bucket not configured.");
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const rawKeys = body.fileKeys;

    if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
      return sendError(400, "fileKeys array is required.");
    }
    if (rawKeys.length > MAX_KEYS) {
      return sendError(400, `At most ${MAX_KEYS} fileKeys allowed per request.`);
    }

    const fileKeys: string[] = [];
    for (const raw of rawKeys) {
      if (typeof raw !== "string") {
        return sendError(400, "Each fileKey must be a string.");
      }
      const trimmed = raw.trim();
      if (!isValidFileKey(trimmed)) {
        return sendError(400, "Invalid or disallowed fileKey.");
      }
      fileKeys.push(trimmed);
    }

    const uniqueKeys = [...new Set(fileKeys)];
    const urls: Record<string, string> = {};

    await Promise.all(
      uniqueKeys.map(async (fileKey) => {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: fileKey,
        });
        urls[fileKey] = await getSignedUrl(s3Client, command, {
          expiresIn: EXPIRES_IN_SECONDS,
        });
      })
    );

    return sendResponse({ urls, expiresIn: EXPIRES_IN_SECONDS }, 200);
  } catch (error: unknown) {
    console.error("Error generating download URLs:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return sendError(500, message);
  }
};
