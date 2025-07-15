import React, { useRef } from 'react';
import styles from './FileInput.module.scss';
import { Button, ButtonVariant } from '../button/Button';

// Uppdaterat interface för att vara mer flexibelt
interface FileInputProps {
  id?: string; // Gör id valfritt
  onFileSelect: (files: File | FileList | null) => void;
  value?: File | null; // Valfritt, för att visa namn på enskild fil
  label?: string; // NY: Valfri label för knappen
  isFolderPicker?: boolean; // NY: Flagga för att aktivera mapp-val
}

export const FileInput = ({
  id,
  onFileSelect,
  value,
  label = 'Välj fil', // Standardvärde för label
  isFolderPicker = false,
}: FileInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Om det är en mapp-väljare, skicka hela fillistan
    if (isFolderPicker) {
      onFileSelect(e.target.files);
    } else {
      // Annars, skicka bara den första filen
      const file = e.target.files?.[0] || null;
      onFileSelect(file);
    }
  };

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  // Visa filnamn endast för enskilda filer
  const displayName = !isFolderPicker && value ? value.name : "Ingen fil har valts";

  return (
    <div className={styles.fileInputContainer}>
      <input
        id={id}
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        className={styles.hiddenInput}
        // Lägg till attribut för mapp-val villkorligt
        {...(isFolderPicker ? { webkitdirectory: "true", directory: "true", multiple: true } : {})}
        key={!isFolderPicker && value ? value.name : 'empty'}
      />
      
      <Button 
        type="button"
        variant={ButtonVariant.Ghost} 
        onClick={handleButtonClick}
      >
        {label} {/* Använd den nya label-propen */}
      </Button>

      {/* Visa bara filnamnet för enskilda fil-uppladdningar */}
      {!isFolderPicker && (
        <span className={styles.fileName}>
          {displayName}
        </span>
      )}
    </div>
  );
};
