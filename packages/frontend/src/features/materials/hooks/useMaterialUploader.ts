import { useCallback, useRef, useState } from 'react';
import { getAuthHeaders } from '@/utils/authHeaders';
import {
  MAX_FILES_PER_BATCH_UPLOAD,
  prepareBatchUpload,
  putToPresignedUrl,
  replaceMaterialFile,
  requestReplaceUploadUrl,
  type LibraryMaterial,
} from '@/services/materialService';
import { endMaterialOp, tryBeginMaterialOp } from '@/features/materials/operationGate';
import { useMaterialNotice } from '@/features/materials/useMaterialNotice';

export type AddFilesProgress =
  | { phase: 'preparing'; totalFiles: number }
  | { phase: 'uploading'; totalFiles: number; percent: number };

function hasSession(): boolean {
  return Boolean(getAuthHeaders().Authorization);
}

function readBackendMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('response' in error)) return undefined;
  const data = (error as { response?: { data?: { message?: unknown } } }).response?.data;
  return typeof data?.message === 'string' ? data.message : undefined;
}

export function useMaterialUploader(decodedPath: string, onUploadComplete: () => void) {
  const [replacingMaterialId, setReplacingMaterialId] = useState<string | null>(null);
  const [isAddingFile, setIsAddingFile] = useState(false);
  const [addFilesProgress, setAddFilesProgress] = useState<AddFilesProgress | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const addFileInputRef = useRef<HTMLInputElement | null>(null);
  const onUploadCompleteRef = useRef(onUploadComplete);
  onUploadCompleteRef.current = onUploadComplete;
  const { replaceStatus, statusAt, setReplaceStatus } = useMaterialNotice();

  const handleReplaceFile = useCallback(async (material: LibraryMaterial, nextFile: File | null) => {
    if (!nextFile) return;

    if (!hasSession()) {
      setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
      return;
    }
    if (!tryBeginMaterialOp('replace')) return;

    try {
      setReplacingMaterialId(material.materialId);
      setReplaceStatus(null);

      const { uploadUrl, key } = await requestReplaceUploadUrl(nextFile.name);
      await putToPresignedUrl(uploadUrl, nextFile);
      await replaceMaterialFile(material.materialId, {
        fileKey: key,
        deleteOldFile: true,
        title: nextFile.name,
      });

      setReplaceStatus({ type: 'success', message: `Fil ersatt: "${nextFile.name}"` });
      await onUploadCompleteRef.current();
    } catch (err) {
      console.error('Failed to replace material file:', err);
      setReplaceStatus({ type: 'error', message: 'Kunde inte ersätta filen. Försök igen.' });
    } finally {
      endMaterialOp('replace');
      setReplacingMaterialId(null);
    }
  }, [setReplaceStatus]);

  const handleAddFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;

      if (!hasSession()) {
        setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
        return;
      }

      const picked = Array.from(fileList);
      if (picked.length > MAX_FILES_PER_BATCH_UPLOAD) {
        setReplaceStatus({
          type: 'error',
          message: `Välj högst ${MAX_FILES_PER_BATCH_UPLOAD} filer åt gången. Du valde ${picked.length}.`,
        });
        return;
      }

      const seenPaths = new Set<string>();
      const files: File[] = [];
      for (const file of picked) {
        const relativePath = decodedPath ? `${decodedPath}/${file.name}` : file.name;
        if (seenPaths.has(relativePath)) continue;
        seenPaths.add(relativePath);
        files.push(file);
      }

      if (files.length === 0) {
        setReplaceStatus({
          type: 'error',
          message: 'Inga unika filer att lägga till (samma namn flera gånger).',
        });
        return;
      }

      if (!tryBeginMaterialOp('add')) return;

      const payload = files.map((file) => ({
        fileName: file.name,
        relativePath: decodedPath ? `${decodedPath}/${file.name}` : file.name,
      }));

      try {
        setIsAddingFile(true);
        setReplaceStatus(null);
        setAddFilesProgress({ phase: 'preparing', totalFiles: files.length });

        const tasks = await prepareBatchUpload(payload);
        if (!tasks.length || tasks.length !== files.length || tasks.some((task) => !task.uploadUrl)) {
          throw new Error('Ogiltigt svar från prepare-batch-upload endpoint.');
        }

        const totalBytes = Math.max(1, files.reduce((sum, file) => sum + file.size, 0));
        const loadedPerFile = files.map(() => 0);

        const updateAggregateProgress = () => {
          const sumLoaded = loadedPerFile.reduce((sum, loaded) => sum + loaded, 0);
          const pct = Math.min(99, Math.round((sumLoaded / totalBytes) * 100));
          setAddFilesProgress({ phase: 'uploading', totalFiles: files.length, percent: pct });
        };

        setAddFilesProgress({ phase: 'uploading', totalFiles: files.length, percent: 0 });

        const uploadResults = await Promise.allSettled(
          files.map((file, index) =>
            putToPresignedUrl(tasks[index].uploadUrl as string, file, (loaded) => {
              loadedPerFile[index] = loaded;
              updateAggregateProgress();
            })
          )
        );

        setAddFilesProgress({ phase: 'uploading', totalFiles: files.length, percent: 100 });

        const failedNames = uploadResults
          .map((result, index) => (result.status === 'rejected' ? files[index].name : null))
          .filter((name): name is string => name != null);

        if (failedNames.length === files.length) {
          setReplaceStatus({
            type: 'error',
            message: 'Uppladdningen misslyckades för alla filer. Försök igen.',
          });
          await onUploadCompleteRef.current();
          return;
        }

        if (failedNames.length > 0) {
          setReplaceStatus({
            type: 'error',
            message: `${files.length - failedNames.length} av ${files.length} filer lades till. Misslyckades: ${failedNames.join(', ')}`,
          });
        } else if (files.length === 1) {
          setReplaceStatus({ type: 'success', message: `Fil tillagd: "${files[0].name}"` });
        } else {
          setReplaceStatus({
            type: 'success',
            message: `${files.length} filer tillagda.`,
          });
        }
        await onUploadCompleteRef.current();
      } catch (err) {
        console.error('Failed to add material files:', err);
        const backendMessage = readBackendMessage(err);
        setReplaceStatus({
          type: 'error',
          message:
            typeof backendMessage === 'string'
              ? backendMessage
              : 'Kunde inte lägga till filerna. Försök igen.',
        });
      } finally {
        endMaterialOp('add');
        setIsAddingFile(false);
        setAddFilesProgress(null);
      }
    },
    [decodedPath, setReplaceStatus]
  );

  const isBusy = isAddingFile || replacingMaterialId !== null;

  return {
    replacingMaterialId,
    isAddingFile,
    addFilesProgress,
    fileInputRefs,
    addFileInputRef,
    handleReplaceFile,
    handleAddFiles,
    replaceStatus,
    statusAt,
    isBusy,
  };
}
