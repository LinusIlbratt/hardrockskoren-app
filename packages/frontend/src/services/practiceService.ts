import type { Material } from '@/types';
import { createAuthedClient } from '@/services/apiClient';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export interface PracticeWeekGroup {
  weekId: string;
  materials: Material[];
}

type RequestOptions = {
  signal?: AbortSignal;
};

/**
 * Sjung upp är inte kör-scopad i API:t.
 * GET /practice/materials/member-view returnerar veckor till och med innevarande vecka.
 */
function getApiClient() {
  if (!API_BASE_URL) {
    throw new Error('API Base URL is not configured. Check your .env file.');
  }
  return createAuthedClient(API_BASE_URL);
}

function isMaterial(value: unknown): value is Material {
  if (!value || typeof value !== 'object') return false;
  const record = value as { materialId?: unknown; fileKey?: unknown };
  return typeof record.materialId === 'string' && typeof record.fileKey === 'string';
}

function parseWeekGroups(data: unknown): PracticeWeekGroup[] {
  if (!Array.isArray(data)) {
    throw new Error('Övningsmaterialet hade ett oväntat format.');
  }
  const weeks: PracticeWeekGroup[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { weekId?: unknown; materials?: unknown };
    if (typeof record.weekId !== 'string' || !record.weekId.trim()) continue;
    const materials = Array.isArray(record.materials) ? record.materials.filter(isMaterial) : [];
    weeks.push({ weekId: record.weekId, materials });
  }
  return weeks;
}

export async function getPracticeMaterials(
  options?: RequestOptions
): Promise<PracticeWeekGroup[]> {
  const response = await getApiClient().get('/practice/materials/member-view', {
    signal: options?.signal,
  });
  return parseWeekGroups(response.data);
}
