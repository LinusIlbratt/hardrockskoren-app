import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { Modal } from '@/components/ui/modal/Modal';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { FileInput } from '@/components/ui/input/FileInput';
import styles from './AdminUploadMaterialPage.module.scss';
import type { Material } from '@/types';

// Återinför API_BASE_URL
const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

// Interface för den nya funktionen
interface UploadStatus {
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
}

export const AdminUploadMaterialPage = () => {
  // States för uppladdning (befintliga)
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // States för listan och radering (befintliga)
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // States för den nya batch-uppladdningen
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchStatusMap, setBatchStatusMap] = useState<Record<string, UploadStatus>>({});
  const [overallProgress, setOverallProgress] = useState(0);

  // Statusmeddelande (befintlig)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'destructive'; message: string } | null>(null);
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Effekt för att räkna ut total progress för batch-uppladdning
  useEffect(() => {
    const statuses = Object.values(batchStatusMap);
    if (statuses.length === 0) {
      setOverallProgress(0);
      return;
    }
    const totalProgress = statuses.reduce((acc, current) => acc + current.progress, 0);
    setOverallProgress(totalProgress / statuses.length);
  }, [batchStatusMap]);

  // Datahämtning (uppdaterad för att använda axios direkt)
  const fetchMaterials = useCallback(async () => {
    setIsLoadingMaterials(true);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get(`${API_BASE_URL}/materials`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMaterials(response.data);
    } catch (error) {
      console.error("Failed to fetch global materials:", error);
      setStatusMessage({ type: 'error', message: 'Kunde inte hämta materiallistan.' });
    } finally {
      setIsLoadingMaterials(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // Befintlig funktion för enskild fil (uppdaterad för att använda axios direkt)
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) {
        setStatusMessage({ type: 'error', message: 'Både titel och fil måste vara valda.' });
        return;
    };
    setIsUploading(true);
    setStatusMessage(null);
    const token = localStorage.getItem('authToken');
    try {
      const { data } = await axios.post(`${API_BASE_URL}/materials/upload-url`, { fileName: file.name }, { headers: { Authorization: `Bearer ${token}` } });
      await axios.put(data.uploadUrl, file, { headers: { 'Content-Type': file.type } });
      await axios.post(`${API_BASE_URL}/materials`, { title, fileKey: data.key }, { headers: { Authorization: `Bearer ${token}` } });
      setStatusMessage({ type: 'success', message: 'Materialet har laddats upp!' });
      setTitle('');
      setFile(null);
      // Rensa fil-inputen
      const fileInput = document.getElementById('single-file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      fetchMaterials();
    } catch (error) {
      setStatusMessage({ type: 'error', message: 'Något gick fel.' });
    } finally {
      setIsUploading(false);
    }
  };

  // NY funktion för mapp-uppladdning (uppdaterad för att använda axios direkt)
  const handleFolderUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsBatchUploading(true);
    setBatchStatusMap({});
    setStatusMessage(null);
    const token = localStorage.getItem('authToken');

    const filesToUpload = Array.from(files).map(f => ({ fileName: f.name }));

    try {
      const { data } = await axios.post(`${API_BASE_URL}/materials/prepare-batch-upload`, { files: filesToUpload }, { headers: { Authorization: `Bearer ${token}` } });
      
      const fileMap = new Map(Array.from(files).map(f => [f.name, f]));
      const uploadPromises = data.uploadTasks.map((task: any) => {
        const fileToUpload = fileMap.get(task.fileName);
        if (!fileToUpload) return Promise.resolve();

        setBatchStatusMap(prev => ({ ...prev, [task.fileName]: { status: 'uploading', progress: 0 } }));
        
        return axios.put(task.uploadUrl, fileToUpload, {
          headers: { 'Content-Type': fileToUpload.type },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setBatchStatusMap(prev => ({ ...prev, [task.fileName]: { status: 'uploading', progress: percent } }));
            }
          }
        }).then(() => {
          setBatchStatusMap(prev => ({ ...prev, [task.fileName]: { status: 'success', progress: 100 } }));
        });
      });

      await Promise.all(uploadPromises);
      setStatusMessage({ type: 'success', message: `${files.length} filer har laddats upp!` });
      fetchMaterials();

    } catch (error) {
      setStatusMessage({ type: 'error', message: 'Något gick fel vid mapp-uppladdningen.' });
    } finally {
      setIsBatchUploading(false);
    }
  };

  // Raderingslogik (uppdaterad för att använda axios direkt)
  const handleSelectionChange = (materialId: string) => {
    const newSelectedIds = new Set(selectedIds);
    if (newSelectedIds.has(materialId)) {
      newSelectedIds.delete(materialId);
    } else {
      newSelectedIds.add(materialId);
    }
    setSelectedIds(newSelectedIds);
  };

  const handleOpenDeleteModal = () => {
    if (selectedIds.size > 0) {
      setIsDeleteModalOpen(true);
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedIds.size === 0) return;

    setIsDeleting(true);
    const token = localStorage.getItem('authToken');
    try {
      await axios.post(`${API_BASE_URL}/materials/batch-delete`, { materialIds: Array.from(selectedIds) }, { headers: { Authorization: `Bearer ${token}` } });
      setStatusMessage({ type: 'destructive', message: 'Valda material har raderats.' });
      setSelectedIds(new Set());
      setIsDeleteModalOpen(false);
      fetchMaterials();
    } catch (error) {
      console.error("Failed to batch delete materials:", error);
      setStatusMessage({ type: 'error', message: 'Kunde inte radera material.' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtrering och rendering
  const { mediaFiles, documentFiles, otherFiles } = useMemo(() => {
    const isMediaFile = (key = '') => key.toLowerCase().match(/\.(mp3|wav|m4a|mp4)$/);
    const isDocumentFile = (key = '') => key.toLowerCase().match(/\.(pdf|txt|doc|docx)$/);

    return {
      mediaFiles: materials.filter(m => isMediaFile(m.fileKey)),
      documentFiles: materials.filter(m => isDocumentFile(m.fileKey)),
      otherFiles: materials.filter(m => !isMediaFile(m.fileKey) && !isDocumentFile(m.fileKey)),
    }
  }, [materials]);

  const renderMaterialList = (files: Material[]) => (
    <ul className={styles.materialList}>
      {files.map(material => (
        <li key={material.materialId} className={styles.materialItem}>
          <input
            type="checkbox"
            id={material.materialId}
            checked={selectedIds.has(material.materialId)}
            onChange={() => handleSelectionChange(material.materialId)}
            className={styles.checkbox}
            aria-label={`Välj ${material.title || material.fileKey}`}
          />
          <label htmlFor={material.materialId}>{material.title || material.fileKey}</label>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={styles.page}>
      <section>
        <h1 className={styles.title}>Mediabibliotek</h1>
        <p>Ladda upp enskilda filer eller välj en hel mapp för att ladda upp allt innehåll.</p>

        <div className={styles.uploadSection}>
          <form onSubmit={handleSingleSubmit} className={styles.form}>
            <h3 className={styles.formTitle}>Ladda upp enskild fil</h3>
            <FormGroup label="Titel på fil">
              <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </FormGroup>
            <FormGroup>
              <FileInput 
                id="single-file-upload" 
                onFileSelect={(selected) => setFile(selected as File | null)} 
                value={file}
                label="Välj fil"
              />
            </FormGroup>
            <Button type="submit" isLoading={isUploading}>Ladda upp fil</Button>
          </form>

          <div className={styles.form}>
            <h3 className={styles.formTitle}>Ladda upp mapp</h3>
            <FileInput 
              label="Välj en mapp"
              onFileSelect={(selected) => handleFolderUpload(selected as FileList | null)}
              isFolderPicker={true} 
            />
            {isBatchUploading && (
              <div style={{ width: '100%', marginTop: '1rem' }}>
                <div style={{ width: '100%', backgroundColor: '#333', borderRadius: '4px' }}>
                  <div style={{ width: `${overallProgress}%`, backgroundColor: '#4caf50', textAlign: 'center', lineHeight: '20px', color: 'white', height: '20px', transition: 'width 0.2s' }}>
                    {overallProgress.toFixed(0)}%
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {statusMessage && <p className={`${styles.statusMessage} ${styles[statusMessage.type]}`}>{statusMessage.message}</p>}
      </section>

      <hr className={styles.divider} />

      <section>
        <div className={styles.listHeader}>
          <h2 className={styles.title}>Befintligt material i biblioteket</h2>
          {selectedIds.size > 0 && (
            <Button variant={ButtonVariant.Destructive} onClick={handleOpenDeleteModal} isLoading={isDeleting}>
              Radera valda ({selectedIds.size})
            </Button>
          )}
        </div>

        {isLoadingMaterials ? (<p>Laddar material...</p>)
          : materials.length > 0 ? (
            <>
              {mediaFiles.length > 0 && (
                <div className={styles.categorySection}>
                  <h3>Mediafiler <span className={styles.subCategorTitle}>(Ljud & Video)</span></h3>
                  {renderMaterialList(mediaFiles)}
                </div>
              )}
              {documentFiles.length > 0 && (
                <div className={styles.categorySection}>
                  <h3>Dokument <span className={styles.subCategorTitle}>(Noter, Texter etc.)</span></h3>
                  {renderMaterialList(documentFiles)}
                </div>
              )}
              {otherFiles.length > 0 && (
                <div className={styles.categorySection}>
                  <h3>Övrigt</h3>
                  {renderMaterialList(otherFiles)}
                </div>
              )}
            </>
          ) : (
            <p>Inga material har laddats upp till biblioteket ännu.</p>
          )}
      </section>

      <Modal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)}
        title="Bekräfta radering"
      >
        <div>
          <p>Är du säker på att du vill radera de valda materialen? Denna åtgärd kan inte ångras.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <Button variant={ButtonVariant.Ghost} onClick={() => setIsDeleteModalOpen(false)}>
              Avbryt
            </Button>
            <Button variant={ButtonVariant.Destructive} isLoading={isDeleting} onClick={handleConfirmDelete}>
              Ja, radera
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
