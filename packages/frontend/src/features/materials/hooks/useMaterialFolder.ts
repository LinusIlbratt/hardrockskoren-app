import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAuthHeaders } from '@/utils/authHeaders';
import { isAbortError } from '@/utils/apiError';
import {
  batchDeleteMaterials,
  deleteMaterial,
  listMaterialsByPath,
  syncAllRepertoires,
  type LibraryMaterial,
} from '@/services/materialService';
import { materialActionError } from '@/features/materials/materialActionError';
import { endMaterialOp, tryBeginMaterialOp } from '@/features/materials/operationGate';
import { useMaterialNotice } from '@/features/materials/useMaterialNotice';

type FolderItem = {
  type: 'folder';
  name: string;
  path: string;
};

type FileItem = {
  type: 'file';
  material: LibraryMaterial;
};

export type DirectoryItem = FolderItem | FileItem;

function parseDirectoryContents(materials: LibraryMaterial[], currentPath: string): DirectoryItem[] {
  const directoryMap = new Map<string, FolderItem | FileItem>();
  const currentPathPrefix = currentPath ? `${currentPath}/` : '';

  materials.forEach((material) => {
    if (!material.filePath?.startsWith(currentPathPrefix)) return;

    const relativePath = material.filePath.substring(currentPathPrefix.length);
    const pathParts = relativePath.split('/');

    if (pathParts.length > 1) {
      const subFolderName = pathParts[0];
      if (!directoryMap.has(subFolderName)) {
        directoryMap.set(subFolderName, {
          type: 'folder',
          name: subFolderName,
          path: `${currentPathPrefix}${subFolderName}`,
        });
      }
    } else {
      const fileName = pathParts[0];
      if (!directoryMap.has(fileName)) {
        directoryMap.set(fileName, {
          type: 'file',
          material,
        });
      }
    }
  });

  return Array.from(directoryMap.values()).sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    const aName = a.type === 'folder' ? a.name : a.material.title || a.material.filePath;
    const bName = b.type === 'folder' ? b.name : b.material.title || b.material.filePath;
    return aName.localeCompare(bName);
  });
}

function hasSession(): boolean {
  return Boolean(getAuthHeaders().Authorization);
}

export function useMaterialFolder(decodedPath: string) {
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [addToChoirsOpen, setAddToChoirsOpen] = useState(false);
  const [materialPendingDelete, setMaterialPendingDelete] = useState<LibraryMaterial | null>(null);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [batchDeleteTargets, setBatchDeleteTargets] = useState<LibraryMaterial[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pathRef = useRef(decodedPath);
  pathRef.current = decodedPath;
  const { replaceStatus, statusAt, setReplaceStatus } = useMaterialNotice();

  const loadMaterials = useCallback(async (options?: { silent?: boolean }) => {
    const requestId = ++requestSeq.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const silent = options?.silent === true;
    const pathForRequest = pathRef.current;
    const pathToFetch = pathForRequest ? `${pathForRequest}/` : '';

    try {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);
      const data = await listMaterialsByPath(pathToFetch, { signal: controller.signal });
      if (requestId !== requestSeq.current || pathRef.current !== pathForRequest) return;
      setMaterials(data);
    } catch (err) {
      if (requestId !== requestSeq.current || isAbortError(err)) return;
      console.error(err);
      if (silent) {
        setReplaceStatus({
          type: 'error',
          message: 'Kunde inte uppdatera listan. Ladda om sidan om något ser fel ut.',
        });
      } else {
        setError('Kunde inte hämta material. Försök igen senare.');
      }
    } finally {
      if (requestId === requestSeq.current) {
        setIsLoading(false);
      }
    }
  }, [setReplaceStatus]);

  useEffect(() => {
    void loadMaterials();
    return () => {
      requestSeq.current += 1;
      abortRef.current?.abort();
    };
  }, [decodedPath, loadMaterials]);

  useEffect(() => {
    setSelectedMaterialIds([]);
    setBatchDeleteTargets([]);
  }, [decodedPath]);

  useEffect(() => {
    setSelectedMaterialIds((prev) => prev.filter((id) => materials.some((m) => m.materialId === id)));
  }, [materials]);

  const performConfirmedDelete = useCallback(async () => {
    const material = materialPendingDelete;
    if (!material) return;

    const displayName = material.title || material.filePath.split('/').pop() || material.materialId;
    if (!hasSession()) {
      setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
      setMaterialPendingDelete(null);
      return;
    }
    if (!tryBeginMaterialOp('delete')) return;

    try {
      setDeletingMaterialId(material.materialId);
      setReplaceStatus(null);
      await deleteMaterial(material.materialId);
      setReplaceStatus({ type: 'success', message: `Fil borttagen: "${displayName}"` });
      await loadMaterials({ silent: true });
    } catch (err) {
      console.error('Failed to delete single file:', err);
      setReplaceStatus({
        type: 'error',
        message: materialActionError(err, 'Kunde inte ta bort filen. Försök igen.'),
      });
    } finally {
      endMaterialOp('delete');
      setDeletingMaterialId(null);
      setMaterialPendingDelete(null);
    }
  }, [loadMaterials, materialPendingDelete, setReplaceStatus]);

  const performConfirmedBatchDelete = useCallback(async () => {
    if (batchDeleteTargets.length === 0) return;

    if (!hasSession()) {
      setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
      setBatchDeleteTargets([]);
      return;
    }
    if (!tryBeginMaterialOp('batch-delete')) return;

    const materialIds = batchDeleteTargets.map((m) => m.materialId);

    try {
      setIsBatchDeleting(true);
      setReplaceStatus(null);
      await batchDeleteMaterials(materialIds);
      setReplaceStatus({
        type: 'success',
        message: materialIds.length === 1 ? '1 fil borttagen.' : `${materialIds.length} filer borttagna.`,
      });
      setSelectedMaterialIds((prev) => prev.filter((id) => !materialIds.includes(id)));
      setBatchDeleteTargets([]);
      await loadMaterials({ silent: true });
    } catch (err) {
      console.error('Failed to batch delete materials:', err);
      setReplaceStatus({
        type: 'error',
        message: materialActionError(err, 'Kunde inte ta bort alla filer. Försök igen.'),
      });
    } finally {
      endMaterialOp('batch-delete');
      setIsBatchDeleting(false);
    }
  }, [batchDeleteTargets, loadMaterials, setReplaceStatus]);

  const performSyncAllRepertoires = useCallback(async () => {
    if (!hasSession()) {
      setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
      setSyncConfirmOpen(false);
      return;
    }
    if (!tryBeginMaterialOp('sync')) return;

    try {
      setIsSyncing(true);
      setReplaceStatus(null);
      const { syncedCount, results } = await syncAllRepertoires(decodedPath);
      if (syncedCount === 0) {
        setReplaceStatus({ type: 'error', message: 'Inga körer har denna mapp länkad i sin repertoar.' });
      } else {
        const summary = results.map((r) => `${r.groupName}: +${r.linkedCount} / -${r.unlinkedCount}`).join(', ');
        setReplaceStatus({ type: 'success', message: `Uppdaterade ${syncedCount} kör(er). ${summary}` });
      }
    } catch (err) {
      console.error('Failed to sync all repertoires:', err);
      setReplaceStatus({
        type: 'error',
        message: materialActionError(err, 'Synkronisering misslyckades. Försök igen.'),
      });
    } finally {
      endMaterialOp('sync');
      setIsSyncing(false);
      setSyncConfirmOpen(false);
    }
  }, [decodedPath, setReplaceStatus]);

  const directoryItems = useMemo(
    () => parseDirectoryContents(materials, decodedPath),
    [materials, decodedPath]
  );

  const fileItemsInFolder = useMemo(
    () => directoryItems.filter((item): item is FileItem => item.type === 'file'),
    [directoryItems]
  );

  const fileIdsInFolder = useMemo(
    () => fileItemsInFolder.map((item) => item.material.materialId),
    [fileItemsInFolder]
  );

  const allFilesInFolderSelected =
    fileIdsInFolder.length > 0 && fileIdsInFolder.every((id) => selectedMaterialIds.includes(id));

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate = selectedMaterialIds.length > 0 && !allFilesInFolderSelected;
  }, [selectedMaterialIds.length, allFilesInFolderSelected]);

  const toggleMaterialSelected = useCallback((materialId: string) => {
    setSelectedMaterialIds((prev) =>
      prev.includes(materialId) ? prev.filter((id) => id !== materialId) : [...prev, materialId]
    );
  }, []);

  const handleSelectAllFilesToggle = useCallback(() => {
    setSelectedMaterialIds((prev) => {
      if (fileIdsInFolder.length === 0) return prev;
      if (fileIdsInFolder.every((id) => prev.includes(id))) {
        return prev.filter((id) => !fileIdsInFolder.includes(id));
      }
      const next = new Set(prev);
      fileIdsInFolder.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }, [fileIdsInFolder]);

  const openBatchDeleteConfirm = useCallback(() => {
    const idSet = new Set(selectedMaterialIds);
    const targets = fileItemsInFolder
      .filter((item) => idSet.has(item.material.materialId))
      .map((item) => item.material);
    if (targets.length === 0) return;
    setMaterialPendingDelete(null);
    setBatchDeleteTargets(targets);
  }, [selectedMaterialIds, fileItemsInFolder]);

  const breadcrumbs = useMemo(() => decodedPath.split('/').filter((p) => p), [decodedPath]);

  const folderCountInView = useMemo(
    () => directoryItems.filter((item) => item.type === 'folder').length,
    [directoryItems]
  );

  const listSummaryLine = useMemo(() => {
    const parts: string[] = [];
    if (folderCountInView > 0) {
      parts.push(`${folderCountInView} ${folderCountInView === 1 ? 'mapp' : 'mappar'}`);
    }
    if (fileItemsInFolder.length > 0) {
      parts.push(`${fileItemsInFolder.length} ${fileItemsInFolder.length === 1 ? 'fil' : 'filer'}`);
    }
    return parts.join(' · ');
  }, [folderCountInView, fileItemsInFolder.length]);

  const isBusy = !!deletingMaterialId || isBatchDeleting || isSyncing;

  return {
    isLoading,
    error,
    replaceStatus,
    statusAt,
    setReplaceStatus,
    deletingMaterialId,
    isSyncing,
    syncConfirmOpen,
    setSyncConfirmOpen,
    addToChoirsOpen,
    setAddToChoirsOpen,
    materialPendingDelete,
    setMaterialPendingDelete,
    selectedMaterialIds,
    batchDeleteTargets,
    setBatchDeleteTargets,
    isBatchDeleting,
    loadMaterials,
    performConfirmedDelete,
    performConfirmedBatchDelete,
    performSyncAllRepertoires,
    directoryItems,
    fileItemsInFolder,
    fileIdsInFolder,
    allFilesInFolderSelected,
    selectAllCheckboxRef,
    toggleMaterialSelected,
    handleSelectAllFilesToggle,
    openBatchDeleteConfirm,
    breadcrumbs,
    listSummaryLine,
    isBusy,
  };
}
