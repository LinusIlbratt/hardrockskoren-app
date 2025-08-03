import { useState, useMemo } from 'react';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { FileInput } from '@/components/ui/input/FileInput';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { Modal } from '@/components/ui/modal/Modal';
import axios from 'axios';
import styles from './WeekAccordion.module.scss';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import type { Material } from '@/types';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

interface WeekAccordionProps {
  weekId: string;
  materials: Material[];
  onUploadOrDeleteSuccess: () => void;
}

export const WeekAccordion = ({ weekId, materials, onUploadOrDeleteSuccess }: WeekAccordionProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // States för uppladdningsformuläret inuti dragspel
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // States för radering (logik från din gamla fil)
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hanterar uppladdning till DENNA specifika vecka
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) {
      setError('Titel och fil krävs.');
      return;
    }
    setIsUploading(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    try {
      const uploadUrlResponse = await axios.post(`${API_BASE_URL}/practice/upload-url`, { fileName: file.name }, { headers: { Authorization: `Bearer ${token}` } });
      const { uploadUrl, key: fileKey } = uploadUrlResponse.data;
      await axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } });
      await axios.post(`${API_BASE_URL}/practice/materials`, { title, fileKey, weekId }, { headers: { Authorization: `Bearer ${token}` } });
      setTitle('');
      setFile(null);
      onUploadOrDeleteSuccess();
    } catch (err) {
      console.error("Upload failed:", err);
      setError('Uppladdningen misslyckades.');
    } finally {
      setIsUploading(false);
    }
  };

  // Raderingslogik, nästan identisk med din gamla fil
  const handleSelectionChange = (materialId: string) => {
    const newSelectedIds = new Set(selectedIds);
    if (newSelectedIds.has(materialId)) {
      newSelectedIds.delete(materialId);
    } else {
      newSelectedIds.add(materialId);
    }
    setSelectedIds(newSelectedIds);
  };

  const handleConfirmDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    const token = localStorage.getItem('authToken');
    try {
      await axios.post(`${API_BASE_URL}/practice/batch-delete`, { materialIds: Array.from(selectedIds) }, { headers: { Authorization: `Bearer ${token}` } });
      setSelectedIds(new Set());
      setIsDeleteModalOpen(false);
      onUploadOrDeleteSuccess(); // Ladda om allt
    } catch (error) {
      console.error("Failed to batch delete materials:", error);
      setError('Raderingen misslyckades.');
    } finally {
      setIsDeleting(false);
    }
  };

  const { mediaFiles, documentFiles, otherFiles } = useMemo(() => {
    const isMediaFile = (key = '') => key.toLowerCase().match(/\.(mp3|wav|m4a|mp4|mov)$/i);
    const isDocumentFile = (key = '') => key.toLowerCase().match(/\.(pdf|txt|doc|docx)$/i);
    return {
      mediaFiles: materials.filter(m => isMediaFile(m.fileKey)),
      documentFiles: materials.filter(m => isDocumentFile(m.fileKey)),
      otherFiles: materials.filter(m => !isMediaFile(m.fileKey) && !isDocumentFile(m.fileKey)),
    };
  }, [materials]);

  const renderMaterialList = (files: Material[]) => (
    <ul className={styles.materialList}>
      {files.map(material => (
        <li key={material.materialId} className={styles.materialItem}>
          <input type="checkbox" id={material.materialId} checked={selectedIds.has(material.materialId)} onChange={() => handleSelectionChange(material.materialId)} className={styles.checkbox} />
          <label htmlFor={material.materialId}>{material.title || material.fileKey}</label>
        </li>
      ))}
    </ul>
  );

  const weekNumber = weekId.split('-W')[1];

  return (
    <div className={styles.accordion}>
      <button className={styles.header} onClick={() => setIsOpen(!isOpen)}>
        <div className={styles.headerTitle}>
          <span>Vecka {weekNumber}</span>
          <span className={styles.fileCount}>{materials.length} fil(er)</span>
        </div>
        {isOpen ? <FiChevronUp /> : <FiChevronDown />}
      </button>

      {isOpen && (
        <div className={styles.content}>
          <div className={styles.contentHeader}>
            <h4>Befintligt material</h4>
            {selectedIds.size > 0 && (
              <Button variant={ButtonVariant.Destructive} onClick={() => setIsDeleteModalOpen(true)}>
                Radera valda ({selectedIds.size})
              </Button>
            )}
          </div>
          {materials.length > 0 ? (
            <>
              {mediaFiles.length > 0 && <div className={styles.categorySection}><h3>Mediafiler</h3>{renderMaterialList(mediaFiles)}</div>}
              {documentFiles.length > 0 && <div className={styles.categorySection}><h3>Dokument</h3>{renderMaterialList(documentFiles)}</div>}
              {otherFiles.length > 0 && <div className={styles.categorySection}><h3>Övrigt</h3>{renderMaterialList(otherFiles)}</div>}
            </>
          ) : (
            <p>Inga filer har laddats upp för denna vecka ännu.</p>
          )}

          <hr className={styles.divider} />
          
          <h4>Lägg till mer material till vecka {weekNumber}</h4>
          <form onSubmit={handleSubmit} className={styles.form}>
            <FormGroup label="Titel på övning" htmlFor={`title-${weekId}`}><Input id={`title-${weekId}`} type="text" value={title} onChange={(e) => setTitle(e.target.value)} required /></FormGroup>
            <FormGroup label="Välj fil"><FileInput onFileSelect={setFile} value={file} /></FormGroup>
            {error && <p className={styles.error}>{error}</p>}
            <Button type="submit" isLoading={isUploading}>Ladda upp till V.{weekNumber}</Button>
          </form>
        </div>
      )}
      <Modal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Bekräfta radering">
        <div>
          <p>Är du säker på att du vill radera de valda filerna? Åtgärden kan inte ångras.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <Button variant={ButtonVariant.Ghost} onClick={() => setIsDeleteModalOpen(false)}>Avbryt</Button>
            <Button variant={ButtonVariant.Primary} isLoading={isDeleting} onClick={handleConfirmDelete}>Ja, radera</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};