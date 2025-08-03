// src/components/ui/input/FileInput.tsx

import React, { useRef } from 'react';
import styles from './FileInput.module.scss';
import { Button, ButtonVariant } from '../button/Button';
import { FiFile, FiXCircle } from 'react-icons/fi';

// --- Props-definitionerna är oförändrade ---

interface SingleFileProps {
  id?: string;
  label?: string;
  isFolderPicker?: false;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
  value: File | null;
}

interface FolderPickerProps {
  id?: string;
  label?: string;
  isFolderPicker: true;
  onFileSelect: (files: FileList | null) => void;
  disabled?: boolean;
  value: FileList | null;
}

type FileInputProps = SingleFileProps | FolderPickerProps;

export const FileInput = (props: FileInputProps) => {
  const { id, label = 'Välj fil', disabled = false } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (props.isFolderPicker) {
      props.onFileSelect(e.target.files);
    } else {
      const file = e.target.files?.[0] || null;
      props.onFileSelect(file);
    }
  };

  const handleRemoveFile = () => {
    if (props.isFolderPicker) {
      props.onFileSelect(null);
    } else {
      props.onFileSelect(null);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };
  
  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  const inputId = id || 'file-input';

  // --- FIX: Här är den uppdaterade logiken ---
  // Vi skapar en variabel för att avgöra om fältet är "tomt".
  let isValueEmpty = false;
  if (!props.value) {
    isValueEmpty = true;
  } else if (props.isFolderPicker && props.value.length === 0) {
    // Om det är en mapp-väljare, kolla `length`.
    // TypeScript förstår nu att props.value är en FileList här.
    isValueEmpty = true;
  }

  return (
    <div className={styles.fileInputContainer}>
      <input
        id={inputId}
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        className={styles.hiddenInput}
        disabled={disabled}
        {...(props.isFolderPicker ? { webkitdirectory: "true", directory: "true", multiple: true } : {})}
      />

      {/* Använd den nya variabeln för att styra vad som visas */}
      {isValueEmpty ? (
        <Button 
          type="button"
          variant={ButtonVariant.Primary}
          onClick={handleButtonClick}
          disabled={disabled}
        >
          {label}
        </Button>
      ) : (
        <div className={styles.fileDisplay}>
          <FiFile />
          <span className={styles.fileName}>
            {!props.isFolderPicker ? props.value!.name : `${props.value!.length} filer valda`}
          </span>
          <button type="button" onClick={handleRemoveFile} className={styles.removeButton} aria-label="Ta bort vald fil">
             <FiXCircle size={22} />
          </button>
        </div>
      )}
    </div>
  );
};