import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileInput } from '@/components/ui/input/FileInput';
import { Cluster } from '@/components/ui/layout/Cluster';
import { Stack } from '@/components/ui/layout/Stack';
import { FiFolder, FiTrash2, FiUploadCloud } from 'react-icons/fi';
import { materialActionError } from '@/features/materials/materialActionError';
import { isAbortError } from '@/utils/apiError';
import {
  MAX_FILES_PER_BATCH_UPLOAD,
  batchDeleteMaterials,
  listGlobalMaterials,
  prepareBatchUpload,
  putToPresignedUrl,
  type LibraryMaterial,
} from '@/services/materialService';
import styles from './AdminUploadMaterialPage.module.scss';

// --- TYPER & HJÄLPFUNKTIONER ---
interface FileNode { type: 'file'; name: string; material: LibraryMaterial; }
interface FolderNode { type: 'folder'; name: string; children: (FolderNode | FileNode)[]; }

const buildFileTree = (materials: LibraryMaterial[]): FolderNode => {
  const root: FolderNode = { type: 'folder', name: 'root', children: [] };
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
        nextNode = { type: 'folder', name: part, children: [] };
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

const getAllMaterialIdsInFolder = (folderNode: FolderNode): string[] => {
  return folderNode.children.flatMap(child =>
    child.type === 'file' ? child.material.materialId : getAllMaterialIdsInFolder(child)
  );
};

/** Undvik API Gateway/Lambda-timeout vid många filer; backend processar redan i chunk om 25. */
const BATCH_DELETE_MAX_IDS = 150;

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

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { response?: { status?: number }; code?: string };
  return err.response?.status === 504 || err.code === 'ECONNABORTED';
}

// --- KOMPONENT FÖR MAPP-RADER (Flyttad utanför huvudkomponenten) ---
interface MaterialFolderItemProps {
  node: FolderNode;
  onDelete: (folderName: string, materialIds: string[]) => void;
  isDeleting: boolean; // ADDED: För att visa laddningsstatus på rätt knapp
}

const MaterialFolderItem: React.FC<MaterialFolderItemProps> = ({ node, onDelete, isDeleting }) => {
  const navigate = useNavigate(); // ADDED: Hook för navigering
  const fileCount = useMemo(() => countFilesInFolder(node), [node]);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idsToDelete = getAllMaterialIdsInFolder(node);
    onDelete(node.name, idsToDelete);
  };

  // CHANGED: Implementerad navigering
  const handleItemClick = () => {
    // encodeURIComponent säkerställer att specialtecken som mellanslag eller '/' fungerar i URL:en
    navigate(`/admin/globalMaterial/${encodeURIComponent(node.name)}`);
  };

  return (
    <div className={styles.materialHit} onClick={handleItemClick}>
      <Cluster gap="md" justify="between" align="center" wrap={false} className={styles.materialItem}>
        <Cluster gap="md" wrap={false} className={styles.itemInfo}>
          <FiFolder size={24} className={styles.itemIcon} />
          <Stack gap="2xs" className={styles.itemText}>
            <span className={styles.itemTitle}>{node.name}</span>
            <span className={styles.itemSubtitle}>{fileCount} {fileCount === 1 ? 'fil' : 'filer'}</span>
          </Stack>
        </Cluster>
        <button
          className={styles.deleteButton}
          onClick={handleDeleteClick}
          title={`Radera mappen ${node.name}`}
          disabled={isDeleting}
        >
          <FiTrash2 size={20} />
        </button>
      </Cluster>
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

  const handleDeleteFolder = useCallback(async (folderName: string, ids: string[]) => {
    if (ids.length === 0 || deletingFolder) return;
    if (!window.confirm(`Är du säker på att du vill radera mappen "${folderName}" och allt dess innehåll (${ids.length} filer)? Detta kan inte ångras.`)) return;

    setDeletingFolder(folderName);
    setStatusMessage(null);
    try {
      for (let i = 0; i < ids.length; i += BATCH_DELETE_MAX_IDS) {
        const chunk = ids.slice(i, i + BATCH_DELETE_MAX_IDS);
        await batchDeleteMaterials(chunk);
      }
      setStatusMessage({ type: 'success', message: `Mappen "${folderName}" har raderats.` });
      await fetchMaterials();
    } catch (error) {
      const detail = isTimeoutError(error)
        ? 'Begäran tog för länge. Försök igen; vid många filer raderas de nu i flera omgångar.'
        : materialActionError(error, 'Kunde inte radera mappen.');
      setStatusMessage({
        type: 'error',
        message: detail,
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
    <Stack gap="xl" className={styles.page}>
      <Stack gap="xs" className={styles.header}>
        <h1>Mediabibliotek</h1>
        <p>Här hanterar du globalt material</p>
      </Stack>

      {statusMessage && (
        <div className={`${styles.statusMessage} ${styles[statusMessage.type]}`}>
          {statusMessage.message}
        </div>
      )}

      <section className={styles.card}>
        <Cluster gap="md" align="center" className={styles.cardHeader}>
          <FiUploadCloud size={20} />
          <h3>Ladda upp en hel mapp</h3>
        </Cluster>
        <Stack gap="lg" className={styles.cardBody}>
          <p>Välj en mapp från din dator. Alla filer och undermappar kommer att laddas upp och organiseras automatiskt.</p>
          <FileInput
            label="Välj mapp"
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
        </Stack>
      </section>

      <section className={styles.card}>
        <Cluster gap="md" align="center" className={styles.cardHeader}>
          <h3>Befintligt material</h3>
        </Cluster>
        <Stack gap="lg" className={styles.cardBody}>
          {isLoading ? <p>Laddar material...</p> :
            topLevelFolders.length > 0 ? (
              <Stack gap="sm">
                {topLevelFolders.sort((a, b) => a.name.localeCompare(b.name)).map(node => (
                  <MaterialFolderItem
                    key={node.name}
                    node={node}
                    onDelete={handleDeleteFolder}
                    isDeleting={deletingFolder === node.name}
                  />
                ))}
              </Stack>
            ) : <p>Inget material har laddats upp ännu.</p>
          }
        </Stack>
      </section>
    </Stack>
  );
};