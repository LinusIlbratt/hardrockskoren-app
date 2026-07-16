import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Modal } from '@/components/ui/modal/Modal';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { DiscardChangesConfirm } from '@/components/ui/form/DiscardChangesConfirm';
import { useModalFormGuard } from '@/hooks/useModalFormGuard';
import styles from './MaterialPickerModal.module.scss';
import type { Material } from '@/types';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

interface MaterialPickerModalProps {
  groupName: string;
  repertoireId: string;
  onClose: () => void;
  onSave: () => void;
}

function MaterialPickerModalBody({
  groupName,
  repertoireId,
  onClose,
  onSave,
}: MaterialPickerModalProps) {
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set<string>());

  const isDirty = selectedIds.size > 0;

  const {
    showDiscardConfirm,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  } = useModalFormGuard({ isDirty, isBlocked: isSaving, onCloseFallback: onClose });

  useEffect(() => {
    const fetchAllMaterials = async () => {
      setIsLoading(true);
      const token = localStorage.getItem('authToken');
      try {
        const response = await axios.get(`${API_BASE_URL}/materials`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setAllMaterials(response.data);
      } catch (error) {
        console.error("Failed to fetch all materials:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllMaterials();
  }, []);

  const handleSelectionChange = (materialId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) {
        next.delete(materialId);
      } else {
        next.add(materialId);
      }
      return next;
    });
  };

  const handleSaveChanges = async () => {
    if (selectedIds.size === 0) {
      alert("Du har inte valt något material att lägga till.");
      return;
    }
    setIsSaving(true);
    const token = localStorage.getItem('authToken');
    try {
      await axios.post(
        `${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/link-materials`,
        { materialIds: Array.from(selectedIds) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSave();
    } catch (error) {
      console.error("Failed to link materials:", error);
      alert("Kunde inte koppla materialet.");
    } finally {
      setIsSaving(false);
    }
  };

  const { mediaFiles, documentFiles, otherFiles } = useMemo(() => {
    const isMediaFile = (key = '') => key.toLowerCase().match(/\.(mp3|wav|m4a|mp4)$/);
    const isDocumentFile = (key = '') => key.toLowerCase().match(/\.(pdf|txt|doc|docx)$/);
    return {
      mediaFiles: allMaterials.filter(m => isMediaFile(m.fileKey)),
      documentFiles: allMaterials.filter(m => isDocumentFile(m.fileKey)),
      otherFiles: allMaterials.filter(m => !isMediaFile(m.fileKey) && !isDocumentFile(m.fileKey)),
    };
  }, [allMaterials]);

  const renderMaterialList = (files: Material[]) => (
    <ul className={styles.materialList}>
      {files.map(material => (
        <li key={material.materialId} className={styles.materialItem}>
          <input
            type="checkbox"
            id={`picker-${material.materialId}`}
            checked={selectedIds.has(material.materialId)}
            onChange={() => handleSelectionChange(material.materialId)}
            className={styles.checkbox}
          />
          <label htmlFor={`picker-${material.materialId}`}>{material.title || material.fileKey}</label>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {isLoading ? <p>Laddar biblioteket...</p>
        : allMaterials.length > 0 ? (
          <>
            {mediaFiles.length > 0 && (
              <div className={styles.categorySection}>
                <h3>Mediafiler</h3>
                {renderMaterialList(mediaFiles)}
              </div>
            )}
            {documentFiles.length > 0 && (
              <div className={styles.categorySection}>
                <h3>Dokument</h3>
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
        ) : <p>Mediabiblioteket är tomt.</p>}

      {showDiscardConfirm && (
        <DiscardChangesConfirm onConfirm={confirmDiscard} onCancel={cancelDiscard} />
      )}

      <div className={styles.modalFooter}>
        <Button variant={ButtonVariant.Ghost} onClick={requestClose} disabled={isSaving}>
          Avbryt
        </Button>
        <Button onClick={handleSaveChanges} isLoading={isSaving}>
          Lägg till {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
        </Button>
      </div>
    </>
  );
}

export const MaterialPickerModal = (props: MaterialPickerModalProps) => (
  <Modal
    formMode
    isOpen
    onClose={props.onClose}
    title="Lägg till material från biblioteket"
  >
    <MaterialPickerModalBody {...props} />
  </Modal>
);
