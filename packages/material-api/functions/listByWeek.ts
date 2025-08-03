// functions/practice/listByWeek.ts

import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import middy from "@middy/core";

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

// Typ för ett enskilt material-objekt efter att det har hämtats och avkodats
interface Material {
  materialId: string;
  title: string;
  fileKey: string;
  weekId: string;
  createdAt: string;
}

// Typ för en grupp av material som tillhör samma vecka
interface WeekGroup {
  weekId: string;
  materials: Material[];
}

export const handler = middy().handler(
  async (): Promise<APIGatewayProxyResultV2> => {
    if (!MAIN_TABLE) {
      return sendError(500, "Server configuration error: MAIN_TABLE is not set.");
    }

    try {
      // STEG 1: Hämta allt Sjungupp-material från DynamoDB
      const scanCommand = new ScanCommand({
        TableName: MAIN_TABLE,
        FilterExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": { S: "SJUNGUPP#MATERIALS" },
        },
      });

      const response = await dbClient.send(scanCommand);
      const items = (response.Items || []).map(item => unmarshall(item)) as Material[];

      // STEG 2: Gruppera materialet per weekId
      const groupedByWeek = items.reduce((acc, material) => {
        const { weekId } = material;
        // Om vi inte har sett denna vecka förut, skapa en ny tom lista för den
        if (!acc[weekId]) {
          acc[weekId] = [];
        }
        // Lägg till det nuvarande materialet i listan för dess vecka
        acc[weekId].push(material);
        return acc;
      }, {} as Record<string, Material[]>);

      // STEG 3: Omvandla det grupperade objektet till en lista och sortera
      const weeklyMaterials: WeekGroup[] = Object.keys(groupedByWeek)
        .map(weekId => ({
          weekId: weekId,
          materials: groupedByWeek[weekId],
        }))
        .sort((a, b) => b.weekId.localeCompare(a.weekId)); // Sortera fallande (nyast först)

      return sendResponse(weeklyMaterials, 200);

    } catch (error: any) {
      console.error("Error listing practice materials by week:", error);
      return sendError(500, error.message);
    }
  }
);