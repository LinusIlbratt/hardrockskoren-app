import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { FileInput } from '@/components/ui/input/FileInput';
import styles from './AdminUploadPage.module.scss';
import type { Material } from '@/types';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export const AdminUploadPage = () => {
  // States för uppladdning
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // States för listan och radering
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [isDeleting, setIsDeleting] = useState(false);

  // Datahämtning
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) {
      setStatusMessage({ type: 'error', message: 'Både titel och fil måste vara valda.' });
      return;
    }
    setIsUploading(true);
    setStatusMessage(null);
    const token = localStorage.getItem('authToken');
    try {
      const uploadUrlResponse = await axios.post(`${API_BASE_URL}/materials/upload-url`, { fileName: file.name }, { headers: { Authorization: `Bearer ${token}` } });
      const { uploadUrl, key } = uploadUrlResponse.data;
      await axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } });
      await axios.post(`${API_BASE_URL}/materials`, { title, fileKey: key }, { headers: { Authorization: `Bearer ${token}` } });
      setStatusMessage({ type: 'success', message: 'Materialet har laddats upp till biblioteket!' });
      setTitle('');
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

  // Hantering av val i listan
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
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Är du säker på att du vill radera ${selectedIds.size} valda material permanent?`)) {
      return;
    }

    setIsDeleting(true);
    const token = localStorage.getItem('authToken');
    try {
      await axios.post(`${API_BASE_URL}/materials/batch-delete`,
        { materialIds: Array.from(selectedIds) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSelectedIds(new Set());
      fetchMaterials();
    } catch (error) {
      console.error("Failed to batch delete materials:", error);
      alert("Kunde inte radera valda material.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtrering av material
  const { mediaFiles, documentFiles, otherFiles } = useMemo(() => {
    const isMediaFile = (key = '') => key.toLowerCase().match(/\.(mp3|wav|m4a|mp4)$/);
    const isDocumentFile = (key = '') => key.toLowerCase().match(/\.(pdf|txt|doc|docx)$/);

    return {
      mediaFiles: materials.filter(m => isMediaFile(m.fileKey)),
      documentFiles: materials.filter(m => isDocumentFile(m.fileKey)),
      otherFiles: materials.filter(m => !isMediaFile(m.fileKey) && !isDocumentFile(m.fileKey)),
    }
  }, [materials]);

  // Hjälpfunktion för att rendera listan
  const renderMaterialList = (files: Material[]) => (
    <ul className={styles.materialList}>
      {files.map(material => (
        <li key={material.materialId} className={styles.materialItem}>
          <input
            type="checkbox"
            id={material.materialId} // Koppla label till checkbox
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
        <p>Här kan du som admin ladda upp och hantera allt material som ska finnas tillgängligt i applikationen.</p>

        {/* --- HÄR ÄR DEN ÅTERSTÄLLDA FORMULÄR-KODEN --- */}
        <form onSubmit={handleSubmit} className={styles.form}>
          <FormGroup label="Titel på fil (t.ex. Noter, Stämma 1)">
            <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormGroup>
          <FormGroup>
            <FileInput id="file-upload" onFileSelect={setFile} value={file} />
          </FormGroup>
          <Button type="submit" isLoading={isUploading}>Ladda upp till biblioteket</Button>
        </form>
        {/* --- SLUT PÅ FORMULÄR-KODEN --- */}

        {statusMessage && <p className={statusMessage.type === 'success' ? styles.successMessage : styles.errorMessage}>{statusMessage.message}</p>}
      </section>

      <hr className={styles.divider} />

      <section>
        <div className={styles.listHeader}>
          <h2 className={styles.title}>Befintligt material i biblioteket</h2>
          {selectedIds.size > 0 && (
            <Button variant={ButtonVariant.Destructive} onClick={handleBatchDelete} isLoading={isDeleting}>
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
                  <h3>Dokument (Noter, Texter etc.)</h3>
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
    </div>
  );
};