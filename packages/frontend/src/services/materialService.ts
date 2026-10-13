import axios from 'axios';
import { createAuthedClient } from '@/services/apiClient';

/**
 * Dynamo TransactWriteItems-gränsen i prepareBatchMaterialUpload.
 * Klienten och Lambdan måste använda samma tak.
 */
export const MAX_FILES_PER_BATCH_UPLOAD = 20;

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export type LibraryMaterial = {
  materialId: string;
  title?: string;
  filePath: string;
  fileKey?: string;
};

export type PreparedUploadTask = {
  uploadUrl?: string;
  fileName?: string;
  relativePath?: string;
};

export type ReplaceMaterialFileBody = {
  fileKey: string;
  title: string;
  deleteOldFile: true;
};

export type SyncRepertoireResult = {
  groupName: string;
  linkedCount: number;
  unlinkedCount: number;
};

export type SyncAllRepertoiresResult = {
  syncedCount: number;
  results: SyncRepertoireResult[];
};

export type LibraryFolderChoirLink = {
  groupSlug: string;
  repertoireId: string;
};

export type LibraryFolderChoirStatus = {
  linked: LibraryFolderChoirLink[];
  notLinked: string[];
  linkedCount: number;
  notLinkedCount: number;
};

export type AddLibraryFolderChoirResult =
  | { groupSlug: string; status: 'added'; repertoireId: string; linkedCount: number }
  | { groupSlug: string; status: 'skipped'; repertoireId: string; reason: string }
  | { groupSlug: string; status: 'failed'; message: string };

export type AddLibraryFolderToChoirsResult = {
  addedCount: number;
  skippedCount: number;
  failedCount: number;
  results: AddLibraryFolderChoirResult[];
};

export type BatchUploadFile = {
  fileName: string;
  relativePath: string;
};

type RequestOptions = {
  signal?: AbortSignal;
};

function requireBaseUrl(): string {
  if (typeof API_BASE_URL !== 'string' || !API_BASE_URL.trim()) {
    throw new Error('API Base URL is not configured. Check your .env file.');
  }
  return API_BASE_URL;
}

function client() {
  return createAuthedClient(requireBaseUrl());
}

function requireNonEmpty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} saknas.`);
  }
  return value;
}

function normalizeSlugs(groupSlugs: string[]): string[] {
  if (!Array.isArray(groupSlugs)) {
    throw new Error('groupSlugs måste vara en lista.');
  }
  const slugs = [
    ...new Set(
      groupSlugs
        .map((slug) => (typeof slug === 'string' ? slug.trim() : ''))
        .filter((slug) => slug.length > 0)
    ),
  ];
  if (slugs.length === 0) {
    throw new Error('Minst en kör krävs.');
  }
  return slugs;
}

export async function listGlobalMaterials(options?: RequestOptions): Promise<LibraryMaterial[]> {
  const response = await client().get('/materials', { signal: options?.signal });
  if (!Array.isArray(response.data)) {
    throw new Error('Materiallistan hade ett oväntat format.');
  }
  return response.data as LibraryMaterial[];
}

export async function listMaterialsByPath(
  path: string,
  options?: RequestOptions
): Promise<LibraryMaterial[]> {
  if (typeof path !== 'string') {
    throw new Error('Ogiltig sökväg.');
  }
  const response = await client().get('/materials-by-path', {
    params: { path },
    signal: options?.signal,
  });
  if (!Array.isArray(response.data)) {
    throw new Error('Materiallistan hade ett oväntat format.');
  }
  return response.data as LibraryMaterial[];
}

export async function requestReplaceUploadUrl(
  fileName: string
): Promise<{ uploadUrl: string; key: string }> {
  requireNonEmpty(fileName, 'fileName');
  const response = await client().post('/materials/upload-url', { fileName });
  const uploadUrl = response.data?.uploadUrl;
  const key = response.data?.key;
  if (typeof uploadUrl !== 'string' || uploadUrl.length === 0 || typeof key !== 'string' || key.length === 0) {
    throw new Error('Ogiltigt svar från upload-url endpoint.');
  }
  return { uploadUrl, key };
}

/**
 * Direkt PUT mot en presigned S3-URL.
 * Får inte gå via createAuthedClient: den sätter Authorization och JSON-content-type.
 */
export async function putToPresignedUrl(
  uploadUrl: string,
  file: File,
  onProgress?: (loaded: number) => void
): Promise<void> {
  requireNonEmpty(uploadUrl, 'Uppladdningslänk');
  if (!(file instanceof File)) {
    throw new Error('Filen saknas.');
  }
  await axios.put(uploadUrl, file, {
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    onUploadProgress: onProgress
      ? (event) => {
          onProgress(event.loaded);
        }
      : undefined,
  });
}

export async function replaceMaterialFile(
  materialId: string,
  body: ReplaceMaterialFileBody
): Promise<void> {
  const id = requireNonEmpty(materialId, 'materialId').trim();
  requireNonEmpty(body.fileKey, 'fileKey');
  if (!body.fileKey.startsWith('materials/')) {
    throw new Error('Ogiltig fileKey.');
  }
  if (body.deleteOldFile !== true) {
    throw new Error('deleteOldFile måste vara true.');
  }
  await client().patch(`/materials/${encodeURIComponent(id)}`, {
    fileKey: body.fileKey,
    deleteOldFile: true,
    title: body.title,
  });
}

export async function prepareBatchUpload(files: BatchUploadFile[]): Promise<PreparedUploadTask[]> {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Inga filer att ladda upp.');
  }
  if (files.length > MAX_FILES_PER_BATCH_UPLOAD) {
    throw new Error(`Högst ${MAX_FILES_PER_BATCH_UPLOAD} filer kan laddas upp åt gången.`);
  }
  for (const file of files) {
    requireNonEmpty(file?.fileName, 'fileName');
    requireNonEmpty(file?.relativePath, 'relativePath');
  }
  const response = await client().post('/materials/prepare-batch-upload', { files });
  const uploadTasks = response.data?.uploadTasks;
  if (!Array.isArray(uploadTasks)) {
    throw new Error('Ogiltigt svar från prepare-batch-upload endpoint.');
  }
  return uploadTasks as PreparedUploadTask[];
}

export async function deleteMaterial(materialId: string): Promise<void> {
  const id = requireNonEmpty(materialId, 'materialId').trim();
  await client().delete(`/materials/${encodeURIComponent(id)}`);
}

export type DeleteLibraryFolderResult = {
  folderPath: string;
  deletedFileCount: number;
  removedRepertoireCount: number;
  message: string;
};

/** Deletes a whole library folder and linked choir repertoires. Not for single files. */
export async function deleteLibraryFolder(folderPath: string): Promise<DeleteLibraryFolderResult> {
  const path = requireNonEmpty(folderPath, 'folderPath').trim().replace(/^\/+|\/+$/g, '');
  if (!path || path.includes('..') || path.includes('\\')) {
    throw new Error('Ogiltig mappsökväg.');
  }
  const response = await client().post('/materials/delete-folder', { folderPath: path });
  const data = response.data;
  if (!data || typeof data !== 'object') {
    throw new Error('Raderingen hade ett oväntat format.');
  }
  return {
    folderPath: typeof data.folderPath === 'string' ? data.folderPath : path,
    deletedFileCount: typeof data.deletedFileCount === 'number' ? data.deletedFileCount : 0,
    removedRepertoireCount:
      typeof data.removedRepertoireCount === 'number' ? data.removedRepertoireCount : 0,
    message: typeof data.message === 'string' ? data.message : 'Mappen har raderats.',
  };
}

export async function batchDeleteMaterials(materialIds: string[]): Promise<void> {
  if (!Array.isArray(materialIds) || materialIds.length === 0) {
    throw new Error('Inga filer att ta bort.');
  }
  const ids = [...new Set(materialIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error('Inga giltiga fil-id.');
  }
  await client().post('/materials/batch-delete', { materialIds: ids });
}

export async function syncAllRepertoires(folderPath: string): Promise<SyncAllRepertoiresResult> {
  const path = requireNonEmpty(folderPath, 'folderPath').trim();
  const response = await client().post('/materials/sync-all-repertoires', { folderPath: path });
  const data = response.data;
  if (!data || typeof data !== 'object' || typeof data.syncedCount !== 'number' || !Array.isArray(data.results)) {
    throw new Error('Synkroniseringen hade ett oväntat format.');
  }
  return {
    syncedCount: data.syncedCount,
    results: data.results as SyncRepertoireResult[],
  };
}

export async function getLibraryFolderChoirStatus(
  folderPath: string,
  groupSlugs: string[]
): Promise<LibraryFolderChoirStatus> {
  const path = requireNonEmpty(folderPath, 'folderPath').trim();
  const slugs = normalizeSlugs(groupSlugs);
  const response = await client().post('/materials/library-folder-choir-status', {
    folderPath: path,
    groupSlugs: slugs,
  });
  const data = response.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.linked) || !Array.isArray(data.notLinked)) {
    throw new Error('Körstatus hade ett oväntat format.');
  }
  return {
    linked: data.linked as LibraryFolderChoirLink[],
    notLinked: data.notLinked.filter((slug: unknown): slug is string => typeof slug === 'string'),
    linkedCount: typeof data.linkedCount === 'number' ? data.linkedCount : data.linked.length,
    notLinkedCount: typeof data.notLinkedCount === 'number' ? data.notLinkedCount : data.notLinked.length,
  };
}

export type RepertoireMaterialOverrides = {
  voiceLabel?: string | null;
  songTitle?: string | null;
};

export type UpdatedRepertoireMaterial = {
  materialId: string;
  voiceLabel?: string;
  songTitle?: string;
};

export async function updateRepertoireMaterial(
  groupName: string,
  repertoireId: string,
  materialId: string,
  overrides: RepertoireMaterialOverrides,
): Promise<UpdatedRepertoireMaterial> {
  const group = requireNonEmpty(groupName, 'groupName').trim();
  const repertoire = requireNonEmpty(repertoireId, 'repertoireId').trim();
  const material = requireNonEmpty(materialId, 'materialId').trim();
  const body: RepertoireMaterialOverrides = {};
  if ('voiceLabel' in overrides) body.voiceLabel = overrides.voiceLabel ?? null;
  if ('songTitle' in overrides) body.songTitle = overrides.songTitle ?? null;
  if (!('voiceLabel' in body) && !('songTitle' in body)) {
    throw new Error('Inget att spara.');
  }
  const response = await client().patch(
    `/groups/${encodeURIComponent(group)}/repertoires/${encodeURIComponent(repertoire)}/materials/${encodeURIComponent(material)}`,
    body,
  );
  const data = response.data;
  if (!data || typeof data !== 'object' || typeof data.materialId !== 'string') {
    throw new Error('Svaret från sparad stämma hade ett oväntat format.');
  }
  return {
    materialId: data.materialId,
    ...(typeof data.voiceLabel === 'string' ? { voiceLabel: data.voiceLabel } : {}),
    ...(typeof data.songTitle === 'string' ? { songTitle: data.songTitle } : {}),
  };
}

export async function addLibraryFolderToChoirs(
  folderPath: string,
  groupSlugs: string[]
): Promise<AddLibraryFolderToChoirsResult> {
  const path = requireNonEmpty(folderPath, 'folderPath').trim();
  const slugs = normalizeSlugs(groupSlugs);
  const response = await client().post('/materials/add-to-choirs', {
    folderPath: path,
    groupSlugs: slugs,
  });
  const data = response.data;
  if (
    !data ||
    typeof data !== 'object' ||
    typeof data.addedCount !== 'number' ||
    typeof data.skippedCount !== 'number' ||
    typeof data.failedCount !== 'number' ||
    !Array.isArray(data.results)
  ) {
    throw new Error('Svaret från lägg-till-i-körer hade ett oväntat format.');
  }
  return {
    addedCount: data.addedCount,
    skippedCount: data.skippedCount,
    failedCount: data.failedCount,
    results: data.results as AddLibraryFolderChoirResult[],
  };
}
