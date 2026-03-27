import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { FiFolder, FiMusic, FiFileText, FiFile, FiTrash2, FiUpload, FiInbox } from 'react-icons/fi';
import { Modal } from '@/components/ui/modal/Modal';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import styles from './MaterialDetailPage.module.scss'; // Antag att du skapar en stilfil för denna sida

// --- TYPER ---
interface MaterialFile {
  materialId: string;
  title?: string;
  filePath: string;
  fileKey?: string;
}

// Typer för att representera det strukturerade innehållet
interface FolderItem {
  type: 'folder';
  name: string;
  path: string;
}
interface FileItem {
  type: 'file';
  material: MaterialFile;
}
type DirectoryItem = FolderItem | FileItem;

/** Måste hållas i synk med prepareBatchMaterialUpload (Dynamo TransactWriteItems-gräns). */
const MAX_FILES_PER_BATCH_UPLOAD = 20;

// --- HJÄLPFUNKTIONER ---

// API-anropet (oförändrat)
const fetchMaterialsByPath = async (path: string): Promise<MaterialFile[]> => {
  const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
  const token = localStorage.getItem('authToken');
  const response = await axios.get(`${API_BASE_URL}/materials-by-path`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { path },
  });
  return response.data;
};

const getIconForFile = (fileName: string, iconClass: string) => {
  if (/\.(mp3|wav|m4a|ogg)$/i.test(fileName)) return <FiMusic className={iconClass} aria-hidden />;
  if (/\.(pdf|txt|doc|docx)$/i.test(fileName)) return <FiFileText className={iconClass} aria-hidden />;
  return <FiFile className={iconClass} aria-hidden />;
};

// Funktion som omvandlar den platta listan till en strukturerad vy
// Ersätt den gamla funktionen med denna
const parseDirectoryContents = (materials: MaterialFile[], currentPath: string): DirectoryItem[] => {
  const directoryMap = new Map<string, FolderItem | FileItem>();
  const currentPathPrefix = currentPath ? `${currentPath}/` : '';

  materials.forEach(material => {
    if (!material.filePath.startsWith(currentPathPrefix)) return;

    const relativePath = material.filePath.substring(currentPathPrefix.length);
    const pathParts = relativePath.split('/');
    
    if (pathParts.length > 1) {
      const subFolderName = pathParts[0];
      if (!directoryMap.has(subFolderName)) {
        directoryMap.set(subFolderName, {
          type: 'folder',
          name: subFolderName,
          path: `${currentPathPrefix}${subFolderName}`
        });
      }
    } else {
      const fileName = pathParts[0];
      if (!directoryMap.has(fileName)) {
        directoryMap.set(fileName, {
          type: 'file',
          material: material,
        });
      }
    }
  });

  // ✅ KORRIGERAD SORTERINGSLOGIK
  return Array.from(directoryMap.values()).sort((a, b) => {
    // Se till att mappar alltid kommer före filer
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }

    // Om båda är av samma typ, sortera alfabetiskt
    // Hämta rätt namn beroende på om det är en mapp eller fil
    const aName = a.type === 'folder' 
      ? a.name 
      : (a.material.title || a.material.filePath);
      
    const bName = b.type === 'folder' 
      ? b.name 
      : (b.material.title || b.material.filePath);

    return aName.localeCompare(bName);
  });
};


// --- HUVUDKOMPONENT ---
export const MaterialDetailPage = () => {
  const { folderPath } = useParams<{ folderPath?: string }>();
  // CHANGED: Avkoda sökvägen från URL:en för att hantera t.ex. mellanslag (%20)
  const decodedPath = useMemo(() => folderPath ? decodeURIComponent(folderPath) : '', [folderPath]);

  const [materials, setMaterials] = useState<MaterialFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replaceStatus, setReplaceStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [replacingMaterialId, setReplacingMaterialId] = useState<string | null>(null);
  const [isAddingFile, setIsAddingFile] = useState(false);
  /** Visuell progress vid tillägg av filer (prepare → S3-uppladdning). */
  const [addFilesProgress, setAddFilesProgress] = useState<
    | null
    | { phase: 'preparing'; totalFiles: number }
    | { phase: 'uploading'; totalFiles: number; percent: number }
  >(null);
  const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [materialPendingDelete, setMaterialPendingDelete] = useState<MaterialFile | null>(null);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [batchDeleteTargets, setBatchDeleteTargets] = useState<MaterialFile[]>([]);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const addFileInputRef = useRef<HTMLInputElement | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);

  const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

  /** `silent`: uppdatera listan utan fullskärms-laddning (undviker "blink" efter uppladdning m.m.). */
  const loadMaterials = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    const pathToFetch = decodedPath ? `${decodedPath}/` : '';
    try {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);
      const data = await fetchMaterialsByPath(pathToFetch);
      setMaterials(data);
    } catch (err) {
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
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [decodedPath]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  useEffect(() => {
    setSelectedMaterialIds([]);
    setBatchDeleteTargets([]);
  }, [decodedPath]);

  useEffect(() => {
    setSelectedMaterialIds((prev) =>
      prev.filter((id) => materials.some((m) => m.materialId === id))
    );
  }, [materials]);

  const handleReplaceFile = useCallback(async (material: MaterialFile, nextFile: File | null) => {
    if (!nextFile) return;

    const token = localStorage.getItem('authToken');
    if (!token) {
      setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
      return;
    }

    try {
      setReplacingMaterialId(material.materialId);
      setReplaceStatus(null);

      const uploadRes = await axios.post(
        `${API_BASE_URL}/materials/upload-url`,
        { fileName: nextFile.name },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const uploadUrl = uploadRes.data?.uploadUrl as string | undefined;
      const key = uploadRes.data?.key as string | undefined;
      if (!uploadUrl || !key) {
        throw new Error('Ogiltigt svar från upload-url endpoint.');
      }

      await axios.put(uploadUrl, nextFile, {
        headers: { 'Content-Type': nextFile.type || 'application/octet-stream' },
      });

      await axios.patch(
        `${API_BASE_URL}/materials/${material.materialId}`,
        { fileKey: key, deleteOldFile: true, title: nextFile.name },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setReplaceStatus({ type: 'success', message: `Fil ersatt: "${nextFile.name}"` });
      await loadMaterials({ silent: true });
    } catch (err) {
      console.error('Failed to replace material file:', err);
      setReplaceStatus({ type: 'error', message: 'Kunde inte ersätta filen. Försök igen.' });
    } finally {
      setReplacingMaterialId(null);
    }
  }, [API_BASE_URL, loadMaterials]);

  const handleAddFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;

      const token = localStorage.getItem('authToken');
      if (!token) {
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
      for (const f of picked) {
        const relativePath = decodedPath ? `${decodedPath}/${f.name}` : f.name;
        if (seenPaths.has(relativePath)) continue;
        seenPaths.add(relativePath);
        files.push(f);
      }

      if (files.length === 0) {
        setReplaceStatus({
          type: 'error',
          message: 'Inga unika filer att lägga till (samma namn flera gånger).',
        });
        return;
      }

      const payload = files.map((f) => ({
        fileName: f.name,
        relativePath: decodedPath ? `${decodedPath}/${f.name}` : f.name,
      }));

      try {
        setIsAddingFile(true);
        setReplaceStatus(null);
        setAddFilesProgress({ phase: 'preparing', totalFiles: files.length });

        const prepRes = await axios.post(
          `${API_BASE_URL}/materials/prepare-batch-upload`,
          { files: payload },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const tasks = prepRes.data?.uploadTasks as
          | { uploadUrl?: string; fileName?: string }[]
          | undefined;
        if (!tasks?.length || tasks.length !== files.length || tasks.some((t) => !t.uploadUrl)) {
          throw new Error('Ogiltigt svar från prepare-batch-upload endpoint.');
        }

        const totalBytes = Math.max(1, files.reduce((sum, f) => sum + f.size, 0));
        const loadedPerFile = files.map(() => 0);

        const updateAggregateProgress = () => {
          const sumLoaded = loadedPerFile.reduce((a, b) => a + b, 0);
          const pct = Math.min(99, Math.round((sumLoaded / totalBytes) * 100));
          setAddFilesProgress({ phase: 'uploading', totalFiles: files.length, percent: pct });
        };

        setAddFilesProgress({ phase: 'uploading', totalFiles: files.length, percent: 0 });

        const uploadResults = await Promise.allSettled(
          files.map((file, i) =>
            axios.put(tasks[i].uploadUrl!, file, {
              headers: { 'Content-Type': file.type || 'application/octet-stream' },
              onUploadProgress: (ev) => {
                loadedPerFile[i] = ev.loaded;
                updateAggregateProgress();
              },
            })
          )
        );

        setAddFilesProgress({ phase: 'uploading', totalFiles: files.length, percent: 100 });

        const failedNames = uploadResults
          .map((r, i) => (r.status === 'rejected' ? files[i].name : null))
          .filter((n): n is string => n != null);

        if (failedNames.length === files.length) {
          setReplaceStatus({
            type: 'error',
            message: 'Uppladdningen misslyckades för alla filer. Försök igen.',
          });
          await loadMaterials({ silent: true });
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
        await loadMaterials({ silent: true });
      } catch (err) {
        console.error('Failed to add material files:', err);
        const axiosErr = err as { response?: { data?: { message?: string } } };
        const backendMessage = axiosErr?.response?.data?.message;
        setReplaceStatus({
          type: 'error',
          message:
            typeof backendMessage === 'string'
              ? backendMessage
              : 'Kunde inte lägga till filerna. Försök igen.',
        });
      } finally {
        setIsAddingFile(false);
        setAddFilesProgress(null);
      }
    },
    [API_BASE_URL, decodedPath, loadMaterials]
  );

  const performConfirmedDelete = useCallback(async () => {
    const material = materialPendingDelete;
    if (!material) return;

    const displayName = material.title || material.filePath.split('/').pop() || material.materialId;
    const token = localStorage.getItem('authToken');
    if (!token) {
      setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
      setMaterialPendingDelete(null);
      return;
    }

    try {
      setDeletingMaterialId(material.materialId);
      setReplaceStatus(null);
      await axios.delete(`${API_BASE_URL}/materials/${material.materialId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReplaceStatus({ type: 'success', message: `Fil borttagen: "${displayName}"` });
      await loadMaterials({ silent: true });
    } catch (err) {
      console.error('Failed to delete single file:', err);
      setReplaceStatus({ type: 'error', message: 'Kunde inte ta bort filen. Försök igen.' });
    } finally {
      setDeletingMaterialId(null);
      setMaterialPendingDelete(null);
    }
  }, [API_BASE_URL, loadMaterials, materialPendingDelete]);

  const performConfirmedBatchDelete = useCallback(async () => {
    if (batchDeleteTargets.length === 0) return;

    const token = localStorage.getItem('authToken');
    if (!token) {
      setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
      setBatchDeleteTargets([]);
      return;
    }

    const materialIds = batchDeleteTargets.map((m) => m.materialId);

    try {
      setIsBatchDeleting(true);
      setReplaceStatus(null);
      await axios.post(
        `${API_BASE_URL}/materials/batch-delete`,
        { materialIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReplaceStatus({
        type: 'success',
        message:
          materialIds.length === 1
            ? '1 fil borttagen.'
            : `${materialIds.length} filer borttagna.`,
      });
      setSelectedMaterialIds((prev) => prev.filter((id) => !materialIds.includes(id)));
      setBatchDeleteTargets([]);
      await loadMaterials({ silent: true });
    } catch (err) {
      console.error('Failed to batch delete materials:', err);
      setReplaceStatus({
        type: 'error',
        message: 'Kunde inte ta bort alla filer. Försök igen.',
      });
    } finally {
      setIsBatchDeleting(false);
    }
  }, [API_BASE_URL, batchDeleteTargets, loadMaterials]);

  const performSyncAllRepertoires = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
      setSyncConfirmOpen(false);
      return;
    }

    try {
      setIsSyncing(true);
      setReplaceStatus(null);
      const res = await axios.post(
        `${API_BASE_URL}/materials/sync-all-repertoires`,
        { folderPath: decodedPath },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { syncedCount, results } = res.data as {
        syncedCount: number;
        results: { groupName: string; linkedCount: number; unlinkedCount: number }[];
      };
      if (syncedCount === 0) {
        setReplaceStatus({ type: 'error', message: 'Inga körer har denna mapp länkad i sin repertoar.' });
      } else {
        const summary = results
          .map((r) => `${r.groupName}: +${r.linkedCount} / -${r.unlinkedCount}`)
          .join(', ');
        setReplaceStatus({ type: 'success', message: `Uppdaterade ${syncedCount} kör(er). ${summary}` });
      }
    } catch (err) {
      console.error('Failed to sync all repertoires:', err);
      const axiosErr = err as any;
      const backendMessage: string | undefined =
        axiosErr?.response?.data?.message || axiosErr?.response?.data?.error?.message;
      setReplaceStatus({
        type: 'error',
        message: backendMessage || 'Synkronisering misslyckades. Försök igen.',
      });
    } finally {
      setIsSyncing(false);
      setSyncConfirmOpen(false);
    }
  }, [API_BASE_URL, decodedPath]);

  // Använd useMemo för att bara köra den tunga parsningslogiken när `materials` ändras
  const directoryItems = useMemo(() => parseDirectoryContents(materials, decodedPath), [materials, decodedPath]);

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
    el.indeterminate =
      selectedMaterialIds.length > 0 &&
      !allFilesInFolderSelected;
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

  const breadcrumbs = useMemo(() => decodedPath.split('/').filter(p => p), [decodedPath]);

  const folderCountInView = useMemo(
    () => directoryItems.filter((i) => i.type === 'folder').length,
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

  const rowBusy =
    !!replacingMaterialId ||
    !!deletingMaterialId ||
    isBatchDeleting;

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.pageInner}>
          <div className={`${styles.pageState} ${styles.pageStateLoading}`}>
            <span className={styles.loadingPulse}>Laddar material…</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.pageInner}>
          <div className={`${styles.pageState} ${styles.pageStateError}`}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageInner}>
      <nav className={styles.breadcrumbs} aria-label="breadcrumb">
        <Link to="/admin/globalMaterial">Mediabibliotek</Link>
        {breadcrumbs.map((part, index) => {
          const pathSlice = breadcrumbs.slice(0, index + 1);
          // VIKTIGT: Använd encodeURIComponent för varje del för att skapa en giltig URL
          const linkPath = pathSlice.map(encodeURIComponent).join('/');
          return <span key={linkPath} className={styles.breadcrumbSep}><span className={styles.breadcrumbSlash} aria-hidden>/</span><Link to={`/admin/globalMaterial/${linkPath}`}>{part}</Link></span>;
        })}
      </nav>

      <header className={styles.headerCard}>
        <div className={styles.pageHeaderRow}>
          <div className={styles.pageHeaderLead}>
            <h1 className={styles.pageTitle}>{breadcrumbs[breadcrumbs.length - 1] || 'Mediabibliotek'}</h1>
            {listSummaryLine ? (
              <p className={styles.pageSubtitle}>{listSummaryLine}</p>
            ) : null}
          </div>
          <div className={styles.headerActions}>
            {breadcrumbs.length === 1 && (
              <button
                type="button"
                className={styles.syncButton}
                disabled={isSyncing}
                onClick={() => setSyncConfirmOpen(true)}
              >
                <span>{isSyncing ? 'Uppdaterar...' : 'Uppdatera i alla körer'}</span>
              </button>
            )}
            <input
              ref={addFileInputRef}
              className={styles.hiddenFileInput}
              type="file"
              multiple
              aria-describedby="add-files-hint"
              onChange={(e) => {
                void handleAddFiles(e.target.files);
                e.currentTarget.value = '';
              }}
            />
            <button
              type="button"
              className={styles.addFileButton}
              disabled={isAddingFile}
              onClick={() => addFileInputRef.current?.click()}
            >
              <FiUpload aria-hidden />
              <span>
                {isAddingFile && addFilesProgress?.phase === 'uploading'
                  ? `Laddar upp ${addFilesProgress.percent}%`
                  : isAddingFile
                    ? 'Förbereder…'
                    : 'Lägg till filer'}
              </span>
            </button>
          </div>
        </div>
        <p id="add-files-hint" className={styles.addFilesHint}>
          Högst {MAX_FILES_PER_BATCH_UPLOAD} filer åt gången vid uppladdning
        </p>
      </header>

      {isAddingFile && addFilesProgress ? (
        <div
          className={styles.uploadProgressPanel}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            addFilesProgress.phase === 'preparing' ? 0 : addFilesProgress.percent
          }
          aria-label={
            addFilesProgress.phase === 'preparing'
              ? 'Förbereder uppladdning'
              : `Uppladdning ${addFilesProgress.percent} procent`
          }
          aria-live="polite"
        >
          <div className={styles.uploadProgressTop}>
            <span className={styles.uploadProgressTitle}>
              {addFilesProgress.phase === 'preparing'
                ? 'Förbereder uppladdning…'
                : addFilesProgress.percent < 100
                  ? `Laddar upp till mediabiblioteket…`
                  : 'Slutför…'}
            </span>
            <span className={styles.uploadProgressMeta}>
              {addFilesProgress.totalFiles}{' '}
              {addFilesProgress.totalFiles === 1 ? 'fil' : 'filer'}
              {addFilesProgress.phase === 'uploading' ? (
                <span className={styles.uploadProgressPercent}>
                  {' '}
                  · {addFilesProgress.percent}%
                </span>
              ) : null}
            </span>
          </div>
          <div className={styles.uploadProgressTrack}>
            {addFilesProgress.phase === 'preparing' ? (
              <div className={styles.uploadProgressIndeterminate} />
            ) : (
              <div
                className={styles.uploadProgressFill}
                style={{ width: `${addFilesProgress.percent}%` }}
              />
            )}
          </div>
        </div>
      ) : null}

      {replaceStatus ? (
        <div className={`${styles.statusMessage} ${styles[replaceStatus.type]}`} role="status">
          {replaceStatus.message}
        </div>
      ) : null}

      <Modal
        isOpen={syncConfirmOpen}
        onClose={() => {
          if (!isSyncing) setSyncConfirmOpen(false);
        }}
        title="Uppdatera låten i alla körer?"
      >
        <div className={styles.syncModalBody}>
          <p>
            Vill du att låten <strong>{decodedPath}</strong> ska se likadan ut i alla körer som använder den?
          </p>
          <p className={styles.syncModalHint}>
            Då hämtar vi innehållet från mediabiblioteket till varje körs repertoar. Nya filer du lagt till här
            blir synliga för medlemmarna, och filer du tagit bort här försvinner också där.
          </p>
          <div className={styles.syncModalActions}>
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              disabled={isSyncing}
              onClick={() => setSyncConfirmOpen(false)}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Primary}
              isLoading={isSyncing}
              onClick={() => void performSyncAllRepertoires()}
            >
              Ja, uppdatera
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!materialPendingDelete}
        onClose={() => {
          if (!deletingMaterialId) setMaterialPendingDelete(null);
        }}
        title="Ta bort fil?"
      >
        <div className={styles.syncModalBody}>
          <p>
            Vill du ta bort <strong>{materialPendingDelete?.title || materialPendingDelete?.filePath.split('/').pop() || 'filen'}</strong>{' '}
            från mediabiblioteket?
          </p>
          <p className={styles.syncModalHint}>Detta går inte att ångra.</p>
          <div className={styles.syncModalActions}>
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              disabled={!!deletingMaterialId}
              onClick={() => setMaterialPendingDelete(null)}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Destructive}
              isLoading={
                !!materialPendingDelete && deletingMaterialId === materialPendingDelete.materialId
              }
              onClick={() => void performConfirmedDelete()}
            >
              Ta bort
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={batchDeleteTargets.length > 0}
        onClose={() => {
          if (!isBatchDeleting) setBatchDeleteTargets([]);
        }}
        title={
          batchDeleteTargets.length === 1
            ? 'Ta bort 1 fil?'
            : `Ta bort ${batchDeleteTargets.length} filer?`
        }
      >
        <div className={styles.syncModalBody}>
          <p>Följande tas bort från mediabiblioteket:</p>
          <ul className={styles.batchDeleteNameList}>
            {batchDeleteTargets.slice(0, 18).map((m) => (
              <li key={m.materialId}>
                {m.title || m.filePath.split('/').pop() || m.materialId}
              </li>
            ))}
          </ul>
          {batchDeleteTargets.length > 18 ? (
            <p className={styles.syncModalHint}>
              … och {batchDeleteTargets.length - 18} till
            </p>
          ) : null}
          <p className={styles.syncModalHint}>Detta går inte att ångra.</p>
          <div className={styles.syncModalActions}>
            <Button
              type="button"
              variant={ButtonVariant.Ghost}
              disabled={isBatchDeleting}
              onClick={() => setBatchDeleteTargets([])}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant={ButtonVariant.Destructive}
              isLoading={isBatchDeleting}
              onClick={() => void performConfirmedBatchDelete()}
            >
              Ta bort alla
            </Button>
          </div>
        </div>
      </Modal>

      <section className={styles.listShell} aria-label="Mappinnehåll">
      <div className={styles.itemList}>
        {fileItemsInFolder.length > 0 ? (
          <div className={styles.selectionBar}>
            <label className={styles.selectAllLabel}>
              <input
                ref={selectAllCheckboxRef}
                type="checkbox"
                checked={allFilesInFolderSelected}
                disabled={rowBusy || fileIdsInFolder.length === 0}
                onChange={() => handleSelectAllFilesToggle()}
              />
              Markera alla filer i mappen
            </label>
            {selectedMaterialIds.length > 0 ? (
              <button
                type="button"
                className={styles.removeSelectedButton}
                disabled={rowBusy}
                onClick={() => openBatchDeleteConfirm()}
              >
                Ta bort valda ({selectedMaterialIds.length})
              </button>
            ) : null}
          </div>
        ) : null}
        {directoryItems.length > 0 ? (
          directoryItems.map(item => (
            item.type === 'folder' ? (
              <Link to={`/admin/globalMaterial/${encodeURIComponent(item.path)}`} key={item.path} className={`${styles.itemRow} ${styles.itemRowFolder}`}>
                <span className={`${styles.itemIconWrap} ${styles.itemIconWrapFolder}`} aria-hidden>
                  <FiFolder className={styles.itemIconSvg} />
                </span>
                <span className={styles.itemName}>{item.name}</span>
              </Link>
            ) : (
              <div
                key={item.material.materialId}
                className={`${styles.itemRow} ${styles.itemRowFile} ${
                  selectedMaterialIds.includes(item.material.materialId) ? styles.itemRowSelected : ''
                }`}
              >
                <input
                  type="checkbox"
                  className={styles.rowSelectCheckbox}
                  checked={selectedMaterialIds.includes(item.material.materialId)}
                  disabled={rowBusy}
                  onChange={() => toggleMaterialSelected(item.material.materialId)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Markera ${item.material.title || item.material.filePath.split('/').pop() || 'fil'}`}
                />
                <div className={styles.itemMain}>
                  <span className={styles.itemIconWrap} aria-hidden>
                    {getIconForFile(item.material.filePath, styles.itemIconSvg)}
                  </span>
                  <span className={styles.itemName}>{item.material.title || item.material.filePath.split('/').pop()}</span>
                </div>
                <div className={styles.itemActions}>
                  <input
                    ref={(el) => {
                      fileInputRefs.current[item.material.materialId] = el;
                    }}
                    className={styles.hiddenFileInput}
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      void handleReplaceFile(item.material, f);
                      e.currentTarget.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className={styles.replaceButton}
                    disabled={
                      replacingMaterialId === item.material.materialId ||
                      deletingMaterialId === item.material.materialId ||
                      isBatchDeleting
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRefs.current[item.material.materialId]?.click();
                    }}
                  >
                    {replacingMaterialId === item.material.materialId ? 'Ersätter...' : 'Ersätt fil'}
                  </button>
                  <button
                    type="button"
                    className={styles.deleteFileButton}
                    disabled={
                      deletingMaterialId === item.material.materialId ||
                      replacingMaterialId === item.material.materialId ||
                      isBatchDeleting
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      setBatchDeleteTargets([]);
                      setMaterialPendingDelete(item.material);
                    }}
                    aria-label={`Ta bort ${item.material.title || item.material.filePath.split('/').pop()}`}
                  >
                    {deletingMaterialId === item.material.materialId ? 'Tar bort...' : <FiTrash2 aria-hidden />}
                  </button>
                </div>
              </div>
            )
          ))
        ) : (
          <div className={styles.emptyState}>
            <span className={styles.emptyStateIcon} aria-hidden>
              <FiInbox />
            </span>
            <p className={styles.emptyStateTitle}>Inget här ännu</p>
            <p className={styles.emptyStateHint}>
              Lägg till filer med knappen ovan, eller öppna en annan mapp.
            </p>
          </div>
        )}
      </div>
      </section>
      </div>
    </div>
  );
};