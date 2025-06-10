import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

export const sendResponse = (
  data: any,
  statusCode = 200
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(data),
});

export const sendError = (
  code: number,
  message: string
): APIGatewayProxyStructuredResultV2 => ({
  statusCode: code,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message }),
});
