import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http"; 

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

export const handler = async (
  // Vi förväntar oss att eventet kan ha en authorizer-kontext
  event: APIGatewayProxyEvent & { requestContext: { authorizer: { lambda: { group?: string } } } }
): Promise<APIGatewayProxyResultV2> => { // KORRIGERING: Ändrad returtyp för att matcha helpers
  if (!MAIN_TABLE) {
    return sendError(500, "Server configuration error: Table name not set.");
  }

  try {
    // Försök först hämta gruppnamnet från URL-parametern (för admin)
    let groupName = event.pathParameters?.groupName;

    // Om inget gruppnamn finns i URL:en, fall tillbaka på att hämta det
    // från den inloggade användarens token (för vanliga medlemmar)
    if (!groupName) {
      groupName = event.requestContext.authorizer?.lambda?.group;
    }

    // Om vi fortfarande inte har ett gruppnamn, kan vi inte fortsätta.
    if (!groupName) {
      return sendError(400, "Group could not be determined.");
    }

    const command = new QueryCommand({
      TableName: MAIN_TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :skPrefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `GROUP#${groupName}` },
        ":skPrefix": { S: "MATERIAL#" },
      },
    });

    const { Items } = await dbClient.send(command);
    
    const materials = (Items || []).map(item => unmarshall(item));

    return sendResponse(materials, 200);

  } catch (error: any) {
    console.error("Error fetching materials:", error);
    return sendError(500, error.message || "Internal server error");
  }
};