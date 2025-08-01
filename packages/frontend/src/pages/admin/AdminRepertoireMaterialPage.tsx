import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { IoEyeOutline, IoInformationCircleOutline } from 'react-icons/io5';
import { FaPlayCircle } from "react-icons/fa";
import { FiFolder, FiMusic, FiFileText, FiFile, FiChevronRight, FiArrowLeft } from 'react-icons/fi';
import styles from './AdminRepertoireMaterialPage.module.scss';
import type { Material } from '@/types';
import { MediaModal } from '@/components/ui/modal/MediaModal';
import { MediaPlayer } from '@/components/media/MediaPlayer';

// --- TYPER ---
// FIX: Lade till 'displayName' för att visa ett städat mappnamn.
interface FolderItem { 
  type: 'folder'; 
  name: string; // Det fullständiga, ursprungliga namnet
  path: string; 
  displayName: string; // Det "städade" namnet för visning
}
interface FileItem { type: 'file'; material: Material; }
type DirectoryItem = FolderItem | FileItem;

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const FILE_BASE_URL = import.meta.env.VITE_S3_BUCKET_URL;

// --- HJÄLPFUNKTIONER ---
const getIconForFile = (fileName: string = '') => {
  if (/\.(mp3|wav|m4a|ogg)$/i.test(fileName)) return <FiMusic className={styles.itemIcon} />;
  if (/\.(pdf|txt|doc|docx)$/i.test(fileName)) return <FiFileText className={styles.itemIcon} />;
  return <FiFile className={styles.itemIcon} />;
};

const isAudioFile = (fileKey: string = '') => /\.(mp3|wav|m4a|ogg)$/i.test(fileKey);
const isVideoFile = (fileKey: string = '') => /\.(mp4|mov|webm|avi)$/i.test(fileKey);
const isDocumentFile = (fileKey: string = '') => /\.(pdf|txt|doc|docx)$/i.test(fileKey);

// FIX: Uppdaterad funktion för att skapa och sortera på 'displayName'.
const parseRepertoireContents = (
  materials: Material[],
  repertoireTitle: string,
  currentSubPath: string
): DirectoryItem[] => {
  const directoryMap = new Map<string, DirectoryItem>();
  const basePath = repertoireTitle;
  const currentFullPath = currentSubPath ? `${basePath}/${currentSubPath}` : basePath;
  const currentPathPrefix = `${currentFullPath}/`;

  materials.forEach(material => {
    const path = material.filePath || material.fileKey || '';
    if (!path || !path.startsWith(currentPathPrefix)) {
      return;
    }
    const relativePath = path.substring(currentPathPrefix.length);
    if (!relativePath) {
      return;
    }
    const pathParts = relativePath.split('/');

    if (pathParts.length > 1) {
      const subFolderName = pathParts[0];
      if (!directoryMap.has(subFolderName)) {
        
        let displayName = subFolderName;
        const prefixRegex = new RegExp(`^${repertoireTitle}\\s*[-_]?\\s*`, 'i');
        displayName = subFolderName.replace(prefixRegex, '');

        if (!displayName) {
          displayName = subFolderName;
        }

        directoryMap.set(subFolderName, {
          type: 'folder',
          name: subFolderName,
          path: `${currentSubPath ? `${currentSubPath}/` : ''}${subFolderName}`,
          displayName: displayName,
        });
      }
    } else {
      const fileName = pathParts[0];
      if (!directoryMap.has(fileName)) {
        directoryMap.set(fileName, { type: 'file', material });
      }
    }
  });

  return Array.from(directoryMap.values()).sort((a, b) => {
    const aPath = a.type === 'file' ? (a.material.filePath || a.material.fileKey || '') : '';
    const bPath = b.type === 'file' ? (b.material.filePath || b.material.fileKey || '') : '';
    
    const aName = a.type === 'folder' ? a.displayName : (a.material.title || aPath);
    const bName = b.type === 'folder' ? b.displayName : (b.material.title || bPath);

    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return aName.localeCompare(bName);
  });
};


export const AdminRepertoireMaterialPage = () => {
  const { groupName, repertoireId } = useParams<{ groupName: string; repertoireId: string }>();
  const splat = useParams()['*'];
  const location = useLocation();
  const navigate = useNavigate();
  
  const [title, setTitle] = useState(location.state?.repertoireTitle);
  const [linkedMaterials, setLinkedMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nowPlaying, setNowPlaying] = useState<{ url: string; title: string; } | null>(null);
  const [materialToView, setMaterialToView] = useState<Material | null>(null);
  
  const fetchLinkedMaterials = useCallback(async () => {
    if (!groupName || !repertoireId) return;
    setIsLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLinkedMaterials(response.data);
    } catch (error) {
      console.error("Failed to fetch linked materials:", error);
      setError("Kunde inte ladda materialet.");
    } finally {
      setIsLoading(false);
    }
  }, [groupName, repertoireId]);

  useEffect(() => {
    const fetchRepertoireDetailsIfNeeded = async () => {
      if (title) return;
      
      const token = localStorage.getItem('authToken');
      try {
        const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTitle(response.data.title);
      } catch (err) {
        console.error("Failed to fetch repertoire details:", err);
        setError("Information om låten saknas. Gå tillbaka till repertoarlistan.");
        setIsLoading(false);
      }
    };
    
    fetchRepertoireDetailsIfNeeded();

    if (title) {
        fetchLinkedMaterials();
    }
  }, [groupName, repertoireId, title, fetchLinkedMaterials]);

  const decodedSubPath = useMemo(() => splat ? decodeURIComponent(splat) : '', [splat]);
  const directoryItems = useMemo(
    () => parseRepertoireContents(linkedMaterials, title || '', decodedSubPath),
    [linkedMaterials, title, decodedSubPath]
  );
  
  const hasFiles = useMemo(() => 
    directoryItems.some(item => item.type === 'file'), 
    [directoryItems]
  );
  
  const breadcrumbs = useMemo(() => decodedSubPath.split('/').filter(p => p), [decodedSubPath]);
  const currentTitle = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1] : title;

  const handleSmartBack = () => {
    if (decodedSubPath) {
      const pathParts = decodedSubPath.split('/').filter(p => p);
      const parentPath = pathParts.slice(0, -1).join('/');
      navigate(`/admin/groups/${groupName}/repertoires/${repertoireId}/materials/${parentPath}`, { 
        state: { repertoireTitle: title } 
      });
    } else {
      navigate(`/admin/groups/${groupName}/repertoires`);
    }
  };

  if (isLoading || !title) return <p className={styles.pageState}>Laddar material...</p>;
  if (error) return <p className={`${styles.pageState} ${styles.error}`}>{error}</p>;

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumbs}>
        <Link to={`/admin/groups/${groupName}/repertoires`}>Repertoar</Link> / 
        <Link to={`/admin/groups/${groupName}/repertoires/${repertoireId}/materials`} state={{ repertoireTitle: title }}> {title}</Link>
        {breadcrumbs.map((part, index) => {
          const pathSlice = breadcrumbs.slice(0, index + 1);
          const linkPath = pathSlice.map(encodeURIComponent).join('/');
          const absoluteLinkPath = `/admin/groups/${groupName}/repertoires/${repertoireId}/materials/${linkPath}`;
          return <span key={linkPath}> / <Link to={absoluteLinkPath} state={{ repertoireTitle: title }}>{part}</Link></span>;
        })}
      </nav>

      <button onClick={handleSmartBack} className={styles.backButton}>
        <FiArrowLeft />
        Tillbaka
      </button>
      
      <div className={styles.header}>
        <h1 className={styles.repertoireTitle}>{currentTitle}</h1>
      </div>

      {hasFiles && (
        <div className={styles.legend}>
          <div className={styles.legendIcon}>
              <IoInformationCircleOutline size={24} />
          </div>
          <p className={styles.legendText}>
            Klicka på <FaPlayCircle size={16} className={styles.inlineIcon} /> för att spela upp och
            <IoEyeOutline size={16} className={styles.inlineIcon} /> för att förhandsvisa.
          </p>
        </div>
      )}

      <div className={styles.itemList}>
        {directoryItems.length > 0 ? (
          directoryItems.map(item =>
            item.type === 'folder' ? (
              <Link to={encodeURIComponent(item.path)} state={{ repertoireTitle: title }} key={item.path} className={styles.itemRow}>
                <div className={styles.itemInfo}>
                  <FiFolder className={styles.itemIcon} />
                  {/* FIX: Använder 'displayName' för en renare lista. */}
                  <span className={styles.itemName}>{item.displayName}</span>
                </div>
                <FiChevronRight className={styles.chevronIcon} />
              </Link>
            ) : (
              <div key={item.material.materialId} className={styles.itemRow}>
                <div className={styles.itemInfo}>
                  {getIconForFile(item.material.filePath || item.material.fileKey)}
                  <span className={styles.itemName}>{item.material.title || (item.material.filePath || item.material.fileKey || '').split('/').pop()}</span>
                </div>
                <div className={styles.actions}>
                  {isAudioFile(item.material.fileKey) && (
                    <button
                      onClick={() => setNowPlaying({
                        url: `${FILE_BASE_URL}/${item.material.fileKey}`,
                        title: item.material.title || item.material.fileKey || ''
                      })}
                      className={styles.iconPlay}
                      title={`Spela upp ${item.material.title || (item.material.filePath || item.material.fileKey || '').split('/').pop()}`}
                      aria-label={`Spela upp ${item.material.title || (item.material.filePath || item.material.fileKey || '').split('/').pop()}`}
                    >
                      <FaPlayCircle size={22} />
                    </button>
                  )}
                  {(isDocumentFile(item.material.fileKey) || isVideoFile(item.material.fileKey)) && (
                    <button
                      onClick={() => setMaterialToView(item.material)}
                      className={styles.iconView}
                      title={`Visa ${item.material.title || (item.material.filePath || item.material.fileKey || '').split('/').pop()}`}
                      aria-label={`Visa ${item.material.title || (item.material.filePath || item.material.fileKey || '').split('/').pop()}`}
                    >
                      <IoEyeOutline size={24} />
                    </button>
                  )}
                </div>
              </div>
            )
          )
        ) : (
          <p>Denna mapp är tom.</p>
        )}
      </div>

      {nowPlaying && <MediaPlayer key={nowPlaying.url} src={nowPlaying.url} title={nowPlaying.title} />}
      {materialToView && <MediaModal isOpen={!!materialToView} onClose={() => setMaterialToView(null)} material={materialToView} />}
    </div>
  );
};