import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { Modal } from '@/components/ui/modal/Modal';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { FileInput } from '@/components/ui/input/FileInput';
import styles from './AdminUploadMaterialPage.module.scss';
import type { Material } from '@/types';

// Denna pekar på roten av ditt API, t.ex. https://ditt-api-id.execute-api.eu-north-1.amazonaws.com
const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export const AdminUploadPracticePage = () => {
  // States för uppladdning
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'destructive'; message: string } | null>(null);

  // States för listan och radering
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    // Om det finns ett meddelande att visa...
    if (statusMessage) {
      // ...starta en timer.
      // Tiden ska vara samma som animationens längd (4s = 4000ms).
      const timer = setTimeout(() => {
        // När timern är slut, nollställ meddelandet så att elementet försvinner.
        setStatusMessage(null);
      }, 4000); 

      // Viktigt: Detta är en "cleanup"-funktion. Om komponenten skulle avmonteras
      // innan timern är klar, ser vi till att avbryta timern för att undvika buggar.
      return () => clearTimeout(timer);
    }
  }, [statusMessage]); 

  // Hämtar allt befintligt Sjungupp-material
  const fetchMaterials = useCallback(async () => {
    setIsLoadingMaterials(true);
    const token = localStorage.getItem('authToken'); // Ersätt med din token-hantering
    try {
      // ANROP 1: Hämtar listan från den nya endpointen
      const response = await axios.get(`${API_BASE_URL}/practice/materials`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMaterials(response.data);
    } catch (error) {
      console.error("Failed to fetch practice materials:", error);
      setStatusMessage({ type: 'error', message: 'Kunde inte hämta övningsmaterial.' });
    } finally {
      setIsLoadingMaterials(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  // Hanterar formulärinskickning för att ladda upp en ny övning
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) {
      setStatusMessage({ type: 'error', message: 'Både titel och fil måste vara valda.' });
      return;
    }
    setIsUploading(true);
    setStatusMessage(null);
    const token = localStorage.getItem('authToken'); // Ersätt med din token-hantering

    try {
      // ANROP 2: Hämta uppladdnings-URL från den nya endpointen
      const uploadUrlResponse = await axios.post(`${API_BASE_URL}/practice/upload-url`, 
        { fileName: file.name }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { uploadUrl, key: fileKey } = uploadUrlResponse.data;

      // Ladda upp filen direkt till S3
      await axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } });

      // ANROP 3: Skapa metadatan via den nya endpointen
      await axios.post(`${API_BASE_URL}/practice/materials`, 
        { title, description, fileKey, fileType: file.type }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Återställ formuläret och ladda om listan
      setStatusMessage({ type: 'success', message: 'Övningen har laddats upp!' });
      setTitle('');
      setDescription('');
      setFile(null);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      fetchMaterials();
    } catch (error) {
      console.error("Upload failed:", error);
      setStatusMessage({ type: 'error', message: 'Något gick fel vid uppladdningen.' });
    } finally {
      setIsUploading(false);
    }
  };

  // Hantering av checkbox-val i listan
  const handleSelectionChange = (materialId: string) => {
    const newSelectedIds = new Set(selectedIds);
    if (newSelectedIds.has(materialId)) {
      newSelectedIds.delete(materialId);
    } else {
      newSelectedIds.add(materialId);
    }
    setSelectedIds(newSelectedIds);
  };

// Hantering av batch-radering
  // const handleBatchDelete = async () => {
  //   if (selectedIds.size === 0) return;
  //   if (!window.confirm(`Är du säker på att du vill radera ${selectedIds.size} valda material permanent?`)) {
  //     return;
  //   }

  //   setIsDeleting(true);
  //   const token = localStorage.getItem('authToken');
  //   try {
  //     await axios.post(`${API_BASE_URL}/practice/batch-delete`,
  //       { materialIds: Array.from(selectedIds) },
  //       { headers: { Authorization: `Bearer ${token}` } }
  //     );
  //     setSelectedIds(new Set());
  //     fetchMaterials();
  //   } catch (error) {
  //     console.error("Failed to batch delete materials:", error);
  //     alert("Kunde inte radera valda material.");
  //   } finally {
  //     setIsDeleting(false);
  //   }
  // };

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
      await axios.post(`${API_BASE_URL}/practice/batch-delete`, 
        { materialIds: Array.from(selectedIds) }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setStatusMessage({ type: 'destructive', message: 'Övningarna har blivit borttagna!' });
      setSelectedIds(new Set());
      setIsDeleteModalOpen(false);
      fetchMaterials();
    } catch (error) {
      console.error("Failed to batch delete materials:", error);
      setStatusMessage({ type: 'success', message: 'Valda material har raderats.' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtrering av material för att gruppera i listan
  const { mediaFiles, documentFiles, otherFiles } = useMemo(() => {
    const isMediaFile = (key = '') => key.toLowerCase().match(/\.(mp3|wav|m4a|mp4|mov)$/i);
    const isDocumentFile = (key = '') => key.toLowerCase().match(/\.(pdf|txt|doc|docx)$/i);

    return {
      mediaFiles: materials.filter(m => isMediaFile(m.fileKey)),
      documentFiles: materials.filter(m => isDocumentFile(m.fileKey)),
      otherFiles: materials.filter(m => !isMediaFile(m.fileKey) && !isDocumentFile(m.fileKey)),
    }
  }, [materials]);

  // Hjälpfunktion för att rendera en lista med checkboxes
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
        <h1 className={styles.title}>Hantera Sjungupp-material</h1>
        <p>Här kan du som admin ladda upp och hantera globalt övningsmaterial som är tillgängligt för alla körer.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <FormGroup htmlFor="practice-title" label="Titel på övning">
            <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormGroup>
          <FormGroup htmlFor="practice-description" label="Beskrivning (valfritt)">
            <Input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormGroup>
          <FormGroup>
            <FileInput id="file-upload" onFileSelect={setFile} value={file} />
          </FormGroup>
          <Button type="submit" isLoading={isUploading}>Ladda upp övning</Button>
        </form>

        {statusMessage && <p className={statusMessage.type === 'success' ? styles.successMessage : styles.errorMessage}>{statusMessage.message}</p>}
      </section>

      <hr className={styles.divider} />

      <section>
        <div className={styles.listHeader}>
          <h2 className={styles.title}>Befintligt Sjungupp-material</h2>
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
                  <h3>Mediafiler (Ljud & Video)</h3>
                  {renderMaterialList(mediaFiles)}
                </div>
              )}
              {documentFiles.length > 0 && (
                <div className={styles.categorySection}>
                  <h3>Dokument (Texter etc.)</h3>
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
            <p>Inget Sjungupp-material har laddats upp ännu.</p>
          )}
      </section>

      {/* Modal för att BEKRÄFTA RADERING */}
            <Modal 
              isOpen={isDeleteModalOpen} 
              onClose={() => setIsDeleteModalOpen(false)}
              title="Bekräfta radering"
            >
              <div>
                <p>Är du säker på att du vill radera materialet. Denna åtgärd kan inte ångras.</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                <Button variant={ButtonVariant.Ghost} onClick={() => (null)}>
                    Avbryt
                  </Button>
                  <Button variant={ButtonVariant.Primary} isLoading={isDeleting} onClick={handleConfirmDelete}>
                    Ja, radera
                  </Button>
                </div>
              </div>
            </Modal>
    </div>
  );
};