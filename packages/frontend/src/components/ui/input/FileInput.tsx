import React, { useRef } from 'react';
import styles from './FileInput.module.scss';
import { Button, ButtonVariant } from '../button/Button';

// "Kontrakt" för när komponenten ska välja en enskild fil.
interface SingleFileProps {
  id?: string;
  label?: string;
  isFolderPicker?: false;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
}

// "Kontrakt" för när komponenten ska välja en hel mapp.
interface FolderPickerProps {
  id?: string;
  label?: string;
  isFolderPicker: true;
  onFileSelect: (files: FileList | null) => void;
  disabled?: boolean;
}

// Komponentens props är nu en av dessa två typer.
type FileInputProps = SingleFileProps | FolderPickerProps;

export const FileInput = (props: FileInputProps) => {
  // Vi destrukturerar bara de props som är gemensamma och inte en del av den villkorliga logiken.
  const { id, label = 'Välj fil', disabled = false } = props;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // ✅ ÄNDRING: Genom att referera till `props.isFolderPicker` direkt,
    // kan TypeScript korrekt smalna av typen för `props.onFileSelect`.
    if (props.isFolderPicker) {
      // Här vet TypeScript att `props` är av typen `FolderPickerProps`,
      // så `props.onFileSelect` förväntar sig en `FileList`.
      props.onFileSelect(e.target.files);
    } else {
      // Här vet TypeScript att `props` är av typen `SingleFileProps`,
      // så `props.onFileSelect` förväntar sig en enskild `File`.
      const file = e.target.files?.[0] || null;
      props.onFileSelect(file);
    }
  };

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className={styles.fileInputContainer}>
      <input
        id={id}
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        className={styles.hiddenInput}
        disabled={disabled}
        // Vi använder `props.isFolderPicker` även här för tydlighetens skull.
        {...(props.isFolderPicker ? { webkitdirectory: "true", directory: "true", multiple: true } : {})}
      />
      
      <Button 
        type="button"
        variant={ButtonVariant.Primary}
        onClick={handleButtonClick}
        disabled={disabled}
      >
        {label}
      </Button>
    </div>
  );
};
