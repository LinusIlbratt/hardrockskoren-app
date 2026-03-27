import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { FiFolder, FiMusic, FiFileText, FiFile, FiTrash2, FiUpload } from 'react-icons/fi'; // ADDED: Ikoner
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

// Funktion för att välja rätt filikon
const getIconForFile = (fileName: string) => {
  if (/\.(mp3|wav|m4a|ogg)$/i.test(fileName)) return <FiMusic />;
  if (/\.(pdf|txt|doc|docx)$/i.test(fileName)) return <FiFileText />;
  return <FiFile />;
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
  const [deletingMaterialId, setDeletingMaterialId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const addFileInputRef = useRef<HTMLInputElement | null>(null);

  const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

  const loadMaterials = useCallback(async () => {
    const pathToFetch = decodedPath ? `${decodedPath}/` : '';
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchMaterialsByPath(pathToFetch);
      setMaterials(data);
    } catch (err) {
      setError("Kunde inte hämta material. Försök igen senare.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [decodedPath]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

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
        { fileKey: key, deleteOldFile: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setReplaceStatus({ type: 'success', message: `Fil ersatt för "${material.title || material.filePath.split('/').pop()}"` });
      await loadMaterials();
    } catch (err) {
      console.error('Failed to replace material file:', err);
      setReplaceStatus({ type: 'error', message: 'Kunde inte ersätta filen. Försök igen.' });
    } finally {
      setReplacingMaterialId(null);
    }
  }, [API_BASE_URL, loadMaterials]);

  const handleAddSingleFile = useCallback(async (file: File | null) => {
    if (!file) return;
    const token = localStorage.getItem('authToken');
    if (!token) {
      setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
      return;
    }

    const relativePath = decodedPath ? `${decodedPath}/${file.name}` : file.name;

    try {
      setIsAddingFile(true);
      setReplaceStatus(null);

      const prepRes = await axios.post(
        `${API_BASE_URL}/materials/prepare-batch-upload`,
        { files: [{ fileName: file.name, relativePath }] },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const task = (prepRes.data?.uploadTasks || [])[0];
      if (!task?.uploadUrl) {
        throw new Error('Ogiltigt svar från prepare-batch-upload endpoint.');
      }

      await axios.put(task.uploadUrl, file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });

      setReplaceStatus({ type: 'success', message: `Fil tillagd: "${file.name}"` });
      await loadMaterials();
    } catch (err) {
      console.error('Failed to add single file:', err);
      setReplaceStatus({ type: 'error', message: 'Kunde inte lägga till filen. Försök igen.' });
    } finally {
      setIsAddingFile(false);
    }
  }, [API_BASE_URL, decodedPath, loadMaterials]);

  const handleDeleteSingleFile = useCallback(async (material: MaterialFile) => {
    const displayName = material.title || material.filePath.split('/').pop() || material.materialId;
    const shouldDelete = window.confirm(`Ta bort filen "${displayName}" från mediabiblioteket?`);
    if (!shouldDelete) return;

    const token = localStorage.getItem('authToken');
    if (!token) {
      setReplaceStatus({ type: 'error', message: 'Saknar auth-token. Logga in igen.' });
      return;
    }

    try {
      setDeletingMaterialId(material.materialId);
      setReplaceStatus(null);
      await axios.delete(`${API_BASE_URL}/materials/${material.materialId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReplaceStatus({ type: 'success', message: `Fil borttagen: "${displayName}"` });
      await loadMaterials();
    } catch (err) {
      console.error('Failed to delete single file:', err);
      setReplaceStatus({ type: 'error', message: 'Kunde inte ta bort filen. Försök igen.' });
    } finally {
      setDeletingMaterialId(null);
    }
  }, [API_BASE_URL, loadMaterials]);

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

  const breadcrumbs = useMemo(() => decodedPath.split('/').filter(p => p), [decodedPath]);

  if (isLoading) {
    return <div className={styles.pageState}>Laddar material...</div>;
  }

  if (error) {
    return <div className={`${styles.pageState} ${styles.error}`}>{error}</div>;
  }

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumbs} aria-label="breadcrumb">
        <Link to="/admin/globalMaterial">Mediabibliotek</Link>
        {breadcrumbs.map((part, index) => {
          const pathSlice = breadcrumbs.slice(0, index + 1);
          // VIKTIGT: Använd encodeURIComponent för varje del för att skapa en giltig URL
          const linkPath = pathSlice.map(encodeURIComponent).join('/');
          return <span key={linkPath}> / <Link to={`/admin/globalMaterial/${linkPath}`}>{part}</Link></span>;
        })}
      </nav>
      
      <div className={styles.pageHeaderRow}>
        <h1 className={styles.pageTitle}>{breadcrumbs[breadcrumbs.length - 1] || 'Mediabibliotek'}</h1>
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
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              void handleAddSingleFile(f);
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
            <span>{isAddingFile ? 'Lägger till...' : 'Lägg till fil'}</span>
          </button>
        </div>
      </div>
      {replaceStatus ? (
        <div className={`${styles.statusMessage} ${styles[replaceStatus.type]}`}>
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
      
      <div className={styles.itemList}>
        {directoryItems.length > 0 ? (
          directoryItems.map(item => (
            item.type === 'folder' ? (
              <Link to={`/admin/globalMaterial/${encodeURIComponent(item.path)}`} key={item.path} className={styles.itemRow}>
                <FiFolder className={styles.itemIcon} />
                <span className={styles.itemName}>{item.name}</span>
              </Link>
            ) : (
              <div key={item.material.materialId} className={styles.itemRow}>
                <div className={styles.itemMain}>
                  {getIconForFile(item.material.filePath)}
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
                      deletingMaterialId === item.material.materialId
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
                      replacingMaterialId === item.material.materialId
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteSingleFile(item.material);
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
          <p>Denna mapp är tom.</p>
        )}
      </div>
    </div>
  );
};