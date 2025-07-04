import React, { useRef } from 'react'; // useState är inte längre nödvändig här
import styles from './FileInput.module.scss';
import { Button, ButtonVariant } from '../button/Button';

interface FileInputProps {
  id: string;
  onFileSelect: (file: File | null) => void;
  value: File | null; // <-- NY PROP: Tar emot den nuvarande filen
}

export const FileInput = ({ id, onFileSelect, value }: FileInputProps) => {
  // --- BORTTAGET: Inget internt state för filnamnet längre ---
  // const [fileName, setFileName] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    // Vi anropar bara förälderns funktion, sätter inget eget state
    onFileSelect(file);
  };

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  // Hämta filnamnet direkt från propen vi får från föräldern
  const displayName = value ? value.name : "Ingen fil har valts";

  return (
    <div className={styles.fileInputContainer}>
      <input
        id={id}
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        className={styles.hiddenInput}
        // Vi lägger till en key här för att hjälpa React att nollställa fältet
        key={value?.name || 'empty'}
      />
      
      <Button 
        type="button"
        variant={ButtonVariant.Ghost} 
        onClick={handleButtonClick}
      >
        Välj fil
      </Button>

      {/* Visar namnet från propen */}
      <span className={styles.fileName}>
        {displayName}
      </span>
    </div>
  );
};