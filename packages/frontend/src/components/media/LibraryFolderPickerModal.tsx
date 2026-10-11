import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { DiscardChangesConfirm } from '@/components/ui/form/DiscardChangesConfirm';
import { useModalFormGuard } from '@/hooks/useModalFormGuard';
import { FiFolder } from 'react-icons/fi';
import styles from './LibraryFolderPickerModal.module.scss';
import type { Material } from '@/types';

interface FolderNode {
  type: 'folder';
  name: string;
  children: FolderNode[];
}

const buildFileTree = (materials: Material[]): FolderNode => {
  const root: FolderNode = { type: 'folder', name: 'root', children: [] };
  materials.forEach(material => {
    const path = material.filePath || material.fileKey || 'unknown-file';
    const pathParts = path.split('/');
    let currentNode: FolderNode = root;
    pathParts.slice(0, -1).forEach(part => {
      if (!part) return;
      let nextNode = currentNode.children.find(
        (child) => child.type === 'folder' && child.name === part
      );
      if (!nextNode) {
        nextNode = { type: 'folder', name: part, children: [] };
        currentNode.children.push(nextNode);
      }
      currentNode = nextNode;
    });
  });
  return root;
};

interface LibraryFolderPickerModalProps {
  onClose: () => void;
  onAdd: (selectedFolder: FolderNode) => void;
}

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

function splitFolderHeading(name: string): { title: string; artist: string } {
  const value = name.trim();
  const parts = value.split(/\s+-\s+/);
  const artist = parts.slice(1).join(' - ').trim();
  if (parts.length >= 2 && parts[0]?.trim() && artist) {
    return { title: parts[0].trim(), artist };
  }
  return { title: value, artist: '' };
}

function LibraryFolderPickerModalBody({ onClose, onAdd }: LibraryFolderPickerModalProps) {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDirty = selectedFolder !== null;

  const {
    showDiscardConfirm,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  } = useModalFormGuard({ isDirty, onCloseFallback: onClose });

  useEffect(() => {
    const fetchFolders = async () => {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem('authToken');
      try {
        const response = await axios.get(`${API_BASE_URL}/materials`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const fileTree = buildFileTree(response.data);
        const topLevelFolders = fileTree.children
          .filter((node): node is FolderNode => node.type === 'folder')
          .sort((a, b) => a.name.localeCompare(b.name));
        setFolders(topLevelFolders);
      } catch (err) {
        console.error("Failed to fetch library folders:", err);
        setError("Kunde inte ladda mappar från biblioteket.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchFolders();
  }, []);

  const handleAddClick = () => {
    if (selectedFolder) {
      onAdd(selectedFolder);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <p>Laddar mappar...</p>;
    }
    if (error) {
      return <p className={styles.error}>{error}</p>;
    }
    if (folders.length === 0) {
      return <p>Det finns inga mappar i mediabiblioteket.</p>;
    }
    return (
      <ul className={styles.folderList}>
        {folders.map(folder => {
          const { title, artist } = splitFolderHeading(folder.name);
          const isSelected = selectedFolder?.name === folder.name;
          return (
            <li
              key={folder.name}
              className={`${styles.folderItem} ${isSelected ? styles.selected : ''}`}
              onClick={() => setSelectedFolder(folder)}
              onDoubleClick={handleAddClick}
            >
              <FiFolder className={styles.folderIcon} aria-hidden />
              <span className={styles.folderText}>
                <span className={styles.folderTitle}>{title}</span>
                {artist ? <span className={styles.folderArtist}>{artist}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <>
      <div className={styles.modalContent}>
        {renderContent()}
      </div>

      {showDiscardConfirm && (
        <DiscardChangesConfirm onConfirm={confirmDiscard} onCancel={cancelDiscard} />
      )}

      <div className={styles.modalFooter}>
        <Button variant={ButtonVariant.Ghost} className={styles.cancelButton} onClick={requestClose}>Avbryt</Button>
        <Button className={styles.addButton} onClick={handleAddClick} disabled={!selectedFolder}>
          Lägg till
        </Button>
      </div>
    </>
  );
}

export const LibraryFolderPickerModal: React.FC<LibraryFolderPickerModalProps> = (props) => (
  <Modal formMode isOpen onClose={props.onClose} title="Välj mapp från mediabiblioteket">
    <LibraryFolderPickerModalBody {...props} />
  </Modal>
);
