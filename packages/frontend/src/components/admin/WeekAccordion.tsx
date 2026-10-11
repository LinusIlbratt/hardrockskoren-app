import { useState } from 'react';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { FileInput } from '@/components/ui/input/FileInput';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { Modal } from '@/components/ui/modal/Modal';
import axios from 'axios';
import styles from './WeekAccordion.module.scss';
import { FiChevronDown, FiChevronUp, FiFile, FiFileText, FiMusic, FiTrash2 } from 'react-icons/fi';
import type { Material } from '@/types';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

interface WeekAccordionProps {
  weekId: string;
  materials: Material[];
  onUploadOrDeleteSuccess: () => void;
}

type FileKind = 'audio' | 'score' | 'other';

const fileKind = (fileKey = ''): FileKind => {
  const key = fileKey.toLowerCase();
  if (/\.(mp3|wav|m4a|aac|ogg|mp4|mov)$/.test(key)) return 'audio';
  if (/\.(pdf|txt|doc|docx)$/.test(key)) return 'score';
  return 'other';
};

const FileKindIcon = ({ kind }: { kind: FileKind }) => {
  if (kind === 'audio') return <FiMusic aria-hidden="true" />;
  if (kind === 'score') return <FiFileText aria-hidden="true" />;
  return <FiFile aria-hidden="true" />;
};

export const WeekAccordion = ({ weekId, materials, onUploadOrDeleteSuccess }: WeekAccordionProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSelectionChange = (materialId: string) => {
    const newSelectedIds = new Set(selectedIds);
    if (newSelectedIds.has(materialId)) {
      newSelectedIds.delete(materialId);
    } else {
      newSelectedIds.add(materialId);
    }
    setSelectedIds(newSelectedIds);
  };

  const openDeleteModal = (ids: string[]) => {
    if (ids.length === 0) return;
    setDeleteTargetIds(ids);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deleteTargetIds.length === 0) return;
    setIsDeleting(true);
    const token = localStorage.getItem('authToken');
    try {
      await axios.post(`${API_BASE_URL}/practice/batch-delete`, { materialIds: deleteTargetIds }, { headers: { Authorization: `Bearer ${token}` } });
      setSelectedIds(prev => {
        const next = new Set(prev);
        deleteTargetIds.forEach(id => next.delete(id));
        return next;
      });
      setDeleteTargetIds([]);
      setIsDeleteModalOpen(false);
      onUploadOrDeleteSuccess();
    } catch (deleteError) {
      console.error("Failed to batch delete materials:", deleteError);
      setError('Raderingen misslyckades.');
    } finally {
      setIsDeleting(false);
    }
  };

  const weekNumber = weekId.split('-W')[1];
  const fileCountLabel = materials.length === 1 ? '1 fil' : `${materials.length} filer`;

  return (
    <div className={styles.accordion}>
      <button type="button" className={styles.header} onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen}>
        <span className={styles.headerTitle}>
          <span>Vecka {weekNumber}</span>
          <span className={styles.fileCount}>{fileCountLabel}</span>
        </span>
        {isOpen ? <FiChevronUp aria-hidden="true" /> : <FiChevronDown aria-hidden="true" />}
      </button>

      {isOpen && (
        <div className={styles.content}>
          {selectedIds.size > 0 && (
            <button
              type="button"
              className={styles.removeSelectedButton}
              onClick={() => openDeleteModal(Array.from(selectedIds))}
            >
              Ta bort markerade ({selectedIds.size})
            </button>
          )}

          {materials.length > 0 ? (
            <ul className={styles.materialList}>
              {materials.map(material => {
                const label = material.title || material.fileKey;
                return (
                  <li key={material.materialId} className={styles.materialItem}>
                    <label className={styles.fileLead} htmlFor={material.materialId}>
                      <input
                        type="checkbox"
                        id={material.materialId}
                        checked={selectedIds.has(material.materialId)}
                        onChange={() => handleSelectionChange(material.materialId)}
                        className={styles.checkbox}
                      />
                      <span className={styles.fileIcon}>
                        <FileKindIcon kind={fileKind(material.fileKey)} />
                      </span>
                      <span className={styles.fileTitle}>{label}</span>
                    </label>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      aria-label={`Radera ${label}`}
                      title="Radera"
                      onClick={() => openDeleteModal([material.materialId])}
                    >
                      <FiTrash2 size={16} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={styles.empty}>Inga filer för den här veckan.</p>
          )}

          <form onSubmit={handleSubmit} className={styles.uploadForm}>
            <p className={styles.uploadLabel}>Lägg till mer material</p>
            <FormGroup label="Titel på övning" htmlFor={`title-${weekId}`}>
              <Input id={`title-${weekId}`} type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </FormGroup>
            <FormGroup label="Fil">
              <FileInput onFileSelect={setFile} value={file} className={styles.filePicker} />
            </FormGroup>
            {error && <p className={styles.error}>{error}</p>}
            <Button type="submit" className={styles.uploadButton} isLoading={isUploading}>Ladda upp</Button>
          </form>
        </div>
      )}

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Bekräfta radering"
        tone="library"
      >
        <div className={styles.modalBody}>
          <p>
            {deleteTargetIds.length === 1
              ? 'Är du säker på att du vill radera filen? Åtgärden kan inte ångras.'
              : `Är du säker på att du vill radera ${deleteTargetIds.length} filer? Åtgärden kan inte ångras.`}
          </p>
          <div className={styles.modalActions}>
            <Button variant={ButtonVariant.Ghost} onClick={() => setIsDeleteModalOpen(false)}>Avbryt</Button>
            <Button variant={ButtonVariant.Primary} isLoading={isDeleting} onClick={handleConfirmDelete}>Ja, radera</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
