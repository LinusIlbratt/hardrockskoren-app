import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileInput } from '@/components/ui/input/FileInput';
import { Cluster } from '@/components/ui/layout/Cluster';
import { FiFolder, FiTrash2 } from 'react-icons/fi';
import { materialActionError } from '@/features/materials/materialActionError';
import { isAbortError } from '@/utils/apiError';
import {
  MAX_FILES_PER_BATCH_UPLOAD,
  deleteLibraryFolder,
  listGlobalMaterials,
  prepareBatchUpload,
  putToPresignedUrl,
  type LibraryMaterial,
} from '@/services/materialService';
import styles from './AdminUploadMaterialPage.module.scss';

// --- TYPER & HJÄLPFUNKTIONER ---
interface FileNode { type: 'file'; name: string; material: LibraryMaterial; }
interface FolderNode { type: 'folder'; name: string; path: string; children: (FolderNode | FileNode)[]; }

const buildFileTree = (materials: LibraryMaterial[]): FolderNode => {
  const root: FolderNode = { type: 'folder', name: 'root', path: '', children: [] };
  materials.forEach(material => {
    const path = material.filePath || material.fileKey || 'unknown-file';
    const pathParts = path.split('/');
    let currentNode: FolderNode = root;
    pathParts.slice(0, -1).forEach(part => {
      if (!part) return; // Hoppa över tomma delar som kan uppstå från t.ex. en inledande '/'
      let nextNode = currentNode.children.find(
        (child): child is FolderNode => child.type === 'folder' && child.name === part
      );
      if (!nextNode) {
        const folderPath = currentNode.path ? `${currentNode.path}/${part}` : part;
        nextNode = { type: 'folder', name: part, path: folderPath, children: [] };
        currentNode.children.push(nextNode);
      }
      currentNode = nextNode;
    });
    const fileName = pathParts[pathParts.length - 1];
    currentNode.children.push({ type: 'file', name: fileName, material: material });
  });
  return root;
};

const countFilesInFolder = (folderNode: FolderNode): number => {
  return folderNode.children.reduce((count, child) => {
    if (child.type === 'file') return count + 1;
    if (child.type === 'folder') return count + countFilesInFolder(child);
    return count;
  }, 0);
};

function relativePathOf(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  const path = withPath.webkitRelativePath?.trim();
  return path ? path : file.name;
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// --- KOMPONENT FÖR MAPP-RADER (Flyttad utanför huvudkomponenten) ---
interface MaterialFolderItemProps {
  node: FolderNode;
  onDelete: (folderPath: string) => void;
  isDeleting: boolean;
}

const MaterialFolderItem: React.FC<MaterialFolderItemProps> = ({ node, onDelete, isDeleting }) => {
  const navigate = useNavigate();
  const fileCount = useMemo(() => countFilesInFolder(node), [node]);

  const handleDeleteClick = () => {
    onDelete(node.path);
  };

  const handleItemClick = () => {
    navigate(`/admin/globalMaterial/${encodeURIComponent(node.path)}`);
  };

  return (
    <div className={styles.materialItem}>
      <button
        type="button"
        className={styles.folderOpen}
        onClick={handleItemClick}
      >
        <FiFolder size={22} className={styles.itemIcon} aria-hidden="true" />
        <span className={styles.itemText}>
          <span className={styles.itemTitle}>{node.name}</span>
          <span className={styles.itemSubtitle}>
            {fileCount} {fileCount === 1 ? 'fil' : 'filer'}
          </span>
        </span>
      </button>
      <button
        type="button"
        className={styles.deleteButton}
        onClick={handleDeleteClick}
        aria-label={`Radera mappen ${node.name}`}
        title={`Radera mappen ${node.name}`}
        disabled={isDeleting}
      >
        <FiTrash2 size={18} aria-hidden="true" />
      </button>
    </div>
  );
};

export const AdminUploadMaterialPage = () => {
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FileList | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [tab, setTab] = useState<'library' | 'upload'>('library');

  const fetchMaterials = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const data = await listGlobalMaterials({ signal });
      if (signal?.aborted) return;
      setMaterials(data);
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) return;
      setStatusMessage({
        type: 'error',
        message: materialActionError(error, 'Kunde inte hämta material.'),
      });
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchMaterials(controller.signal);
    return () => controller.abort();
  }, [fetchMaterials]);

  const handleFolderUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadProgress(0);
    setStatusMessage(null);
    setSelectedFolder(files);

    const items = Array.from(files).map((file) => ({
      file,
      fileName: file.name,
      relativePath: relativePathOf(file),
    }));
    const total = items.length;
    let completed = 0;

    try {
      for (const batch of chunkItems(items, MAX_FILES_PER_BATCH_UPLOAD)) {
        const tasks = await prepareBatchUpload(
          batch.map(({ fileName, relativePath }) => ({ fileName, relativePath }))
        );
        if (tasks.length !== batch.length || tasks.some((task) => !task.uploadUrl || !task.relativePath)) {
          throw new Error('Ogiltigt svar från prepare-batch-upload endpoint.');
        }

        const fileByPath = new Map(batch.map((item) => [item.relativePath, item.file]));
        await Promise.all(
          tasks.map(async (task) => {
            const fileToUpload = fileByPath.get(task.relativePath as string);
            if (!fileToUpload || !task.uploadUrl) {
              throw new Error('Ogiltigt svar från prepare-batch-upload endpoint.');
            }
            await putToPresignedUrl(task.uploadUrl, fileToUpload);
            completed += 1;
            setUploadProgress(Math.round((completed / total) * 100));
          })
        );
      }
      setStatusMessage({ type: 'success', message: `${files.length} filer har laddats upp!` });
      setSelectedFolder(null);
      setTab('library');
      await fetchMaterials();
    } catch (error) {
      const detail = materialActionError(error, 'Något gick fel vid uppladdningen.');
      setStatusMessage({
        type: 'error',
        message: completed > 0 ? `${completed} av ${total} filer laddades upp. ${detail}` : detail,
      });
      if (completed > 0) {
        await fetchMaterials();
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFolder = useCallback(async (folderPath: string) => {
    if (!folderPath || deletingFolder) return;
    const confirmed = window.confirm(
      `Är du säker på att du vill radera mappen "${folderPath}"?\n\nDetta raderar mappen och tar automatiskt bort låten ur alla körers repertoarer.`
    );
    if (!confirmed) return;

    setDeletingFolder(folderPath);
    setStatusMessage(null);
    try {
      const result = await deleteLibraryFolder(folderPath);
      const removed = result.removedRepertoireCount;
      setStatusMessage({
        type: 'success',
        message:
          removed > 0
            ? `Mappen "${folderPath}" har raderats och tagits bort ur ${removed} repertoar(er).`
            : `Mappen "${folderPath}" har raderats.`,
      });
      await fetchMaterials();
    } catch (error) {
      setStatusMessage({
        type: 'error',
        message: materialActionError(error, 'Kunde inte radera mappen.'),
      });
    } finally {
      setDeletingFolder(null);
    }
  }, [deletingFolder, fetchMaterials]);

  const fileTree = useMemo(() => materials.length > 0 ? buildFileTree(materials) : null, [materials]);
  const topLevelFolders = useMemo(() =>
    fileTree?.children.filter((node): node is FolderNode => node.type === 'folder') || [],
    [fileTree]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Material</h1>

      <div className={styles.segment} role="tablist" aria-label="Material">
        <button
          type="button"
          role="tab"
          id="material-tab-library"
          aria-selected={tab === 'library'}
          aria-controls="material-panel-library"
          className={styles.segmentButton}
          onClick={() => setTab('library')}
        >
          Befintligt material
        </button>
        <button
          type="button"
          role="tab"
          id="material-tab-upload"
          aria-selected={tab === 'upload'}
          aria-controls="material-panel-upload"
          className={styles.segmentButton}
          onClick={() => setTab('upload')}
        >
          Ladda upp mapp
        </button>
      </div>

      {statusMessage && (
        <div className={`${styles.statusMessage} ${styles[statusMessage.type]}`} role="status">
          {statusMessage.message}
        </div>
      )}

      {tab === 'upload' && (
        <section
          id="material-panel-upload"
          role="tabpanel"
          aria-labelledby="material-tab-upload"
          className={styles.uploadPanel}
        >
          <p className={styles.uploadIntro}>
            Välj en mapp från din dator. Alla filer och undermappar kommer att laddas upp och organiseras automatiskt.
          </p>
          <FileInput
            label="Välj mapp"
            className={styles.pickFolderButton}
            onFileSelect={handleFolderUpload}
            isFolderPicker={true}
            disabled={isUploading || !!deletingFolder}
            value={selectedFolder}
          />
          {isUploading && (
            <Cluster gap="md" align="center" wrap={false} className={styles.progressWrapper}>
              <div className={styles.progressBarContainer}><div className={styles.progressBar} style={{ width: `${uploadProgress}%` }} /></div>
              <span className={styles.progressText}>{uploadProgress}%</span>
            </Cluster>
          )}
        </section>
      )}

      {tab === 'library' && (
        <section
          id="material-panel-library"
          role="tabpanel"
          aria-labelledby="material-tab-library"
          className={styles.library}
        >
          {isLoading ? <p className={styles.muted}>Laddar material...</p> :
            topLevelFolders.length > 0 ? (
              <div className={styles.folderList}>
                {topLevelFolders.sort((a, b) => a.name.localeCompare(b.name)).map(node => (
                  <MaterialFolderItem
                    key={node.path}
                    node={node}
                    onDelete={handleDeleteFolder}
                    isDeleting={deletingFolder === node.path}
                  />
                ))}
              </div>
            ) : <p className={styles.muted}>Inget material har laddats upp ännu.</p>
          }
        </section>
      )}
    </div>
  );
};