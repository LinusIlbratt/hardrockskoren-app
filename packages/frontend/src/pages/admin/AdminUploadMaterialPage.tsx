import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom'; // ADDED: För navigering
import axios from 'axios';
import { FileInput } from '@/components/ui/input/FileInput';
import { FiFolder, FiTrash2, FiUploadCloud } from 'react-icons/fi';
import styles from './AdminUploadMaterialPage.module.scss';
import type { Material } from '@/types';

// --- TYPER & HJÄLPFUNKTIONER ---
interface FileNode { type: 'file'; name: string; material: Material; }
interface FolderNode { type: 'folder'; name: string; children: (FolderNode | FileNode)[]; }

const buildFileTree = (materials: Material[]): FolderNode => {
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
    <div className={styles.materialItem} onClick={handleItemClick}>
      <div className={styles.itemInfo}>
        <FiFolder size={24} className={styles.itemIcon} />
        <div className={styles.itemText}>
          <span className={styles.itemTitle}>{node.name}</span>
          <span className={styles.itemSubtitle}>{fileCount} {fileCount === 1 ? 'fil' : 'filer'}</span>
        </div>
      </div>
      <button
        className={styles.deleteButton}
        onClick={handleDeleteClick}
        title={`Radera mappen ${node.name}`}
        disabled={isDeleting} // ADDED: Inaktivera knappen under radering
      >
        <FiTrash2 size={20} />
      </button>
    </div>
  );
};

// --- HUVUDKOMPONENT ---
const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export const AdminUploadMaterialPage = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<FileList | null>(null);

  // CHANGED: Bättre state för att hantera radering av specifik mapp
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);

  const fetchMaterials = useCallback(async () => {
    setIsLoading(true);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get(`${API_BASE_URL}/materials`, { headers: { Authorization: `Bearer ${token}` } });
      setMaterials(response.data);
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'Kunde inte hämta material.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const handleFolderUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setUploadProgress(0);
    setStatusMessage(null);
    setSelectedFolder(files);
    const token = localStorage.getItem('authToken');
    const filesToUpload = Array.from(files).map(f => ({ fileName: f.name, relativePath: (f as any).webkitRelativePath || f.name }));
    try {
      const { data } = await axios.post(`${API_BASE_URL}/materials/prepare-batch-upload`, { files: filesToUpload }, { headers: { Authorization: `Bearer ${token}` } });
      const fileMap = new Map(Array.from(files).map(f => [(f as any).webkitRelativePath, f]));
      let uploadedCount = 0;
      const uploadPromises = data.uploadTasks.map((task: any) => {
        const fileToUpload = fileMap.get(task.relativePath);
        if (!fileToUpload) return Promise.resolve();
        return axios.put(task.uploadUrl, fileToUpload, { headers: { 'Content-Type': fileToUpload.type } })
          .then(() => {
            uploadedCount++;
            setUploadProgress(Math.round((uploadedCount / data.uploadTasks.length) * 100));
          });
      });
      await Promise.all(uploadPromises);
      setStatusMessage({ type: 'success', message: `${files.length} filer har laddats upp!` });
      await fetchMaterials();
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'Något gick fel vid uppladdningen.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteFolder = useCallback(async (folderName: string, ids: string[]) => {
    if (ids.length === 0 || deletingFolder) return;
    if (!window.confirm(`Är du säker på att du vill radera mappen "${folderName}" och allt dess innehåll (${ids.length} filer)? Detta kan inte ångras.`)) return;

    setDeletingFolder(folderName); // CHANGED: Sätt vilken mapp som raderas
    setStatusMessage(null);
    const token = localStorage.getItem('authToken');
    try {
      await axios.post(`${API_BASE_URL}/materials/batch-delete`, { materialIds: ids }, { headers: { Authorization: `Bearer ${token}` } });
      setStatusMessage({ type: 'success', message: `Mappen "${folderName}" har raderats.` });
      await fetchMaterials(); // Hämta den uppdaterade listan
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'Kunde inte radera mappen.' });
    } finally {
      setDeletingFolder(null); // CHANGED: Nollställ oavsett resultat
    }
  }, [deletingFolder, fetchMaterials]); // ADDED: Dependencies

  const fileTree = useMemo(() => materials.length > 0 ? buildFileTree(materials) : null, [materials]);
  const topLevelFolders = useMemo(() =>
    fileTree?.children.filter((node): node is FolderNode => node.type === 'folder') || [],
    [fileTree]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Mediabibliotek</h1>
        <p>Här hanterar du globalt material som kan användas för Sjung upp-övningar.</p>
      </header>

      {/* ADDED: Visa statusmeddelanden för användaren */}
      {statusMessage && (
        <div className={`${styles.statusMessage} ${styles[statusMessage.type]}`}>
          {statusMessage.message}
        </div>
      )}

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <FiUploadCloud size={20} />
          <h3>Ladda upp en hel mapp</h3>
        </div>
        <div className={styles.cardBody}>
          <p>Välj en mapp från din dator. Alla filer och undermappar kommer att laddas upp och organiseras automatiskt.</p>
          <FileInput
            label="Välj mapp"
            onFileSelect={handleFolderUpload}
            isFolderPicker={true}
            disabled={isUploading || !!deletingFolder}
            value={selectedFolder} // <-- LÄGG TILL DENNA RAD
          />
          {isUploading && (
            <div className={styles.progressWrapper}>
              <div className={styles.progressBarContainer}><div className={styles.progressBar} style={{ width: `${uploadProgress}%` }} /></div>
              <span className={styles.progressText}>{uploadProgress}%</span>
            </div>
          )}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h3>Befintligt material</h3>
        </div>
        <div className={styles.cardBody}>
          {isLoading ? <p>Laddar material...</p> :
            topLevelFolders.length > 0 ? (
              <div className={styles.materialList}>
                {topLevelFolders.sort((a, b) => a.name.localeCompare(b.name)).map(node => (
                  <MaterialFolderItem
                    key={node.name}
                    node={node}
                    onDelete={handleDeleteFolder}
                    isDeleting={deletingFolder === node.name} // CHANGED: Skicka med rätt status
                  />
                ))}
              </div>
            ) : <p>Inget material har laddats upp ännu.</p>
          }
        </div>
      </section>
    </div>
  );
};