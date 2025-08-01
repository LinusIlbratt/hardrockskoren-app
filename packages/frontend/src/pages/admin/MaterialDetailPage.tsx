import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { FiFolder, FiMusic, FiFileText, FiFile } from 'react-icons/fi'; // ADDED: Ikoner
import styles from './MaterialDetailPage.module.scss'; // Antag att du skapar en stilfil för denna sida

// --- TYPER ---
interface MaterialFile {
  materialId: string;
  title: string;
  filePath: string;
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

  useEffect(() => {
    const loadMaterials = async () => {
      // Vi skickar den *kodade* sökvägen till API:et, men använder den avkodade för logik
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
    };

    loadMaterials();
  }, [decodedPath]);

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
      
      <h1 className={styles.pageTitle}>{breadcrumbs[breadcrumbs.length - 1] || 'Mediabibliotek'}</h1>
      
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
                {getIconForFile(item.material.filePath)}
                <span className={styles.itemName}>{item.material.title || item.material.filePath.split('/').pop()}</span>
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