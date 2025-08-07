// functions/listForMembers.ts

import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import middy from "@middy/core";
import { getISOWeek, getYear } from 'date-fns'; // Importera date-fns

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

interface Material {
  materialId: string;
  title: string;
  fileKey: string;
  weekId: string;
  createdAt: string;
}

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
      // STEG 1: Räkna ut den nuvarande veckans ID
      const now = new Date();
      const currentYear = getYear(now);
      const currentWeekNumber = getISOWeek(now);
      const currentWeekId = `${currentYear}-W${String(currentWeekNumber).padStart(2, '0')}`;
      
      console.log(`Current week calculated as: ${currentWeekId}`);

      // STEG 2: Hämta allt material som är från nuvarande eller tidigare veckor
      const scanCommand = new ScanCommand({
        TableName: MAIN_TABLE,
        // FilterExpression letar upp rätt typ OCH ser till att weekId är mindre än eller lika med nuvarande vecka
        FilterExpression: "PK = :pk AND weekId <= :currentWeekId",
        ExpressionAttributeValues: {
          ":pk": { S: "SJUNGUPP#MATERIALS" },
          ":currentWeekId": { S: currentWeekId },
        },
      });

      const response = await dbClient.send(scanCommand);
      const items = (response.Items || []).map(item => unmarshall(item)) as Material[];

      // STEG 3: Gruppera och sortera (samma logik som i listByWeek)
      const groupedByWeek = items.reduce((acc, material) => {
        const { weekId } = material;
        if (!acc[weekId]) {
          acc[weekId] = [];
        }
        acc[weekId].push(material);
        return acc;
      }, {} as Record<string, Material[]>);

      const weeklyMaterials: WeekGroup[] = Object.keys(groupedByWeek)
        .map(weekId => ({
          weekId: weekId,
          materials: groupedByWeek[weekId],
        }))
        .sort((a, b) => b.weekId.localeCompare(a.weekId)); // Sortera fallande (nyast först)

      return sendResponse(weeklyMaterials, 200);

    } catch (error: any) {
      console.error("Error listing practice materials for members:", error);
      return sendError(500, error.message);
    }
  }
);