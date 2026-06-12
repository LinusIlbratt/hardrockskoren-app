// functions/listForMembers.ts

import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { APIGatewayProxyResultV2 } from "aws-lambda";
import { sendResponse, sendError } from "../../core/utils/http";
import middy from "@middy/core";
import { getISOWeek, getYear } from 'date-fns'; // Importera date-fns

const dbClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const MAIN_TABLE = process.env.MAIN_TABLE;

const PK_SJUNGUPP = "SJUNGUPP#MATERIALS";

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

      // STEG 2: Hämta allt Sjungupp-material via Query med FilterExpression för weekId <= currentWeekId
      const allItems: Material[] = [];
      let lastEvaluatedKey: Record<string, unknown> | undefined;

      do {
        const queryCommand = new QueryCommand({
          TableName: MAIN_TABLE,
          KeyConditionExpression: "PK = :pk",
          FilterExpression: "weekId <= :currentWeekId",
          ExpressionAttributeValues: {
            ":pk": { S: PK_SJUNGUPP },
            ":currentWeekId": { S: currentWeekId },
          },
          ExclusiveStartKey: lastEvaluatedKey as Record<string, { S?: string; N?: string }> | undefined,
        });

        const response = await dbClient.send(queryCommand);
        const batch = (response.Items || []).map(item => unmarshall(item)) as Material[];
        allItems.push(...batch);
        lastEvaluatedKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
      } while (lastEvaluatedKey);

      const items = allItems;

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