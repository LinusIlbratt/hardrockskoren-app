import axios from 'axios';
import type { Material } from '@/types';

const API_BASE_URL = import.meta.env.VITE_MUSIC_API_URL as string | undefined;

export type ToggleFavoriteResult = {
  isFavorite: boolean;
  materialId: string;
};

export interface Playlist {
  playlistId: string;
  title: string;
  description?: string;
  createdAt: string;
}

export interface PlaylistItem {
  materialId: string;
  addedAt: string;
  material: Material;
}

function isPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.playlistId === 'string' &&
    typeof o.title === 'string' &&
    typeof o.createdAt === 'string' &&
    (o.description === undefined || typeof o.description === 'string')
  );
}

function parseMaterialFromApi(value: unknown): Material {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid material object in API response.');
  }
  const o = value as Record<string, unknown>;
  if (typeof o.materialId !== 'string' || typeof o.fileKey !== 'string') {
    throw new Error('Invalid material object in API response.');
  }
  const m: Material = {
    materialId: o.materialId,
    fileKey: o.fileKey,
  };
  if (typeof o.title === 'string') m.title = o.title;
  if (typeof o.fileType === 'string') m.fileType = o.fileType;
  if (typeof o.filePath === 'string') m.filePath = o.filePath;
  if (typeof o.createdAt === 'string') m.createdAt = o.createdAt;
  return m;
}

function isPlaylistItem(value: unknown): value is PlaylistItem {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o.materialId !== 'string' || typeof o.addedAt !== 'string') {
    return false;
  }
  if (!o.material || typeof o.material !== 'object') {
    return false;
  }
  try {
    parseMaterialFromApi(o.material);
    return true;
  } catch {
    return false;
  }
}

function parsePlaylistsResponse(data: unknown): Playlist[] {
  if (!Array.isArray(data)) {
    throw new Error('Unexpected response shape from GET /playlists.');
  }
  const out: Playlist[] = [];
  for (const item of data) {
    if (!isPlaylist(item)) {
      throw new Error('Invalid playlist entry in GET /playlists response.');
    }
    out.push({
      playlistId: item.playlistId,
      title: item.title,
      createdAt: item.createdAt,
      ...(item.description !== undefined ? { description: item.description } : {}),
    });
  }
  return out;
}

function parsePlaylistResponse(data: unknown): Playlist {
  if (!isPlaylist(data)) {
    throw new Error('Unexpected response shape from POST /playlists.');
  }
  return {
    playlistId: data.playlistId,
    title: data.title,
    createdAt: data.createdAt,
    ...(data.description !== undefined ? { description: data.description } : {}),
  };
}

function parsePlaylistItemsResponse(data: unknown): PlaylistItem[] {
  if (!Array.isArray(data)) {
    throw new Error('Unexpected response shape from GET /playlists/.../items.');
  }
  const out: PlaylistItem[] = [];
  for (const item of data) {
    if (!isPlaylistItem(item)) {
      throw new Error('Invalid playlist item in response.');
    }
    const row = item as unknown as Record<string, unknown>;
    out.push({
      materialId: row.materialId as string,
      addedAt: row.addedAt as string,
      material: parseMaterialFromApi(row.material),
    });
  }
  return out;
}

function parseFavoritesMaterialsResponse(data: unknown): Material[] {
  if (!Array.isArray(data)) {
    throw new Error('Unexpected response shape from GET /favorites.');
  }
  const out: Material[] = [];
  for (const item of data) {
    out.push(parseMaterialFromApi(item));
  }
  return out;
}

/**
 * Axios-klient med bas-URL och Bearer-token från localStorage (samma mönster som övriga services).
 */
const getApiClient = () => {
  if (!API_BASE_URL?.trim()) {
    throw new Error(
      'VITE_MUSIC_API_URL is not configured. Add it to your .env file.'
    );
  }

  const raw = localStorage.getItem('authToken');
  const token = typeof raw === 'string' ? raw.trim() : '';
  if (!token) {
    throw new Error('Not authenticated: missing authToken in localStorage.');
  }

  return axios.create({
    baseURL: API_BASE_URL.replace(/\/$/, ''),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
};

/**
 * Växlar favoritstatus för ett material (POST /favorites/{materialId}).
 */
export async function toggleFavorite(
  materialId: string
): Promise<ToggleFavoriteResult> {
  const id = materialId?.trim();
  if (!id) {
    throw new Error('materialId is required.');
  }

  const client = getApiClient();
  const { data } = await client.post<ToggleFavoriteResult>(
    `/favorites/${encodeURIComponent(id)}`
  );
  return data;
}

/**
 * Hämtar hydrerade favorit-material (globalt bibliotek) för inloggad användare (GET /favorites).
 */
export async function getFavorites(): Promise<Material[]> {
  const client = getApiClient();
  const { data } = await client.get<unknown>('/favorites');
  return parseFavoritesMaterialsResponse(data);
}

/**
 * Hämtar användarens spellistor (GET /playlists).
 */
export async function getPlaylists(): Promise<Playlist[]> {
  const client = getApiClient();
  const { data } = await client.get<unknown>('/playlists');
  return parsePlaylistsResponse(data);
}

/**
 * Skapar en ny spellista (POST /playlists).
 */
export async function createPlaylist(
  title: string,
  description?: string
): Promise<Playlist> {
  const t = title?.trim();
  if (!t) {
    throw new Error('title is required.');
  }

  const client = getApiClient();
  const body: { title: string; description?: string } = { title: t };
  const d = description?.trim();
  if (d) {
    body.description = d;
  }

  const { data } = await client.post<unknown>('/playlists', body);
  return parsePlaylistResponse(data);
}

/**
 * Hämtar låtar i en spellista (GET /playlists/{playlistId}/items).
 */
export async function getPlaylistItems(
  playlistId: string
): Promise<PlaylistItem[]> {
  const id = playlistId?.trim();
  if (!id) {
    throw new Error('playlistId is required.');
  }

  const client = getApiClient();
  const { data } = await client.get<unknown>(
    `/playlists/${encodeURIComponent(id)}/items`
  );
  return parsePlaylistItemsResponse(data);
}

export type AddPlaylistItemResult = {
  success: boolean;
  materialId: string;
};

/**
 * Lägger till material i spellista (POST /playlists/{playlistId}/items).
 */
export async function addPlaylistItem(
  playlistId: string,
  materialId: string
): Promise<AddPlaylistItemResult> {
  const pid = playlistId?.trim();
  const mid = materialId?.trim();
  if (!pid || !mid) {
    throw new Error('playlistId and materialId are required.');
  }

  const client = getApiClient();
  const { data } = await client.post<AddPlaylistItemResult>(
    `/playlists/${encodeURIComponent(pid)}/items`,
    { materialId: mid }
  );

  if (
    !data ||
    typeof data.success !== 'boolean' ||
    typeof data.materialId !== 'string'
  ) {
    throw new Error('Unexpected response shape from POST /playlists/.../items.');
  }

  return data;
}

export type RemovePlaylistItemResult = { success: boolean };

/**
 * Tar bort material från spellista (DELETE /playlists/{playlistId}/items/{materialId}).
 */
export async function removePlaylistItem(
  playlistId: string,
  materialId: string
): Promise<RemovePlaylistItemResult> {
  const pid = playlistId?.trim();
  const mid = materialId?.trim();
  if (!pid || !mid) {
    throw new Error('playlistId and materialId are required.');
  }

  const client = getApiClient();
  const { data } = await client.delete<RemovePlaylistItemResult>(
    `/playlists/${encodeURIComponent(pid)}/items/${encodeURIComponent(mid)}`
  );

  if (!data || typeof data.success !== 'boolean') {
    throw new Error('Unexpected response shape from DELETE /playlists/.../items/....');
  }

  return data;
}
