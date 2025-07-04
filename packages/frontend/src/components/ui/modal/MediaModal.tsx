import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import type { Material } from '@/types/index';
import styles from './MediaModal.module.scss';
import { IoClose } from 'react-icons/io5';

interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: Material | null;
}

const FILE_BASE_URL = import.meta.env.VITE_S3_BUCKET_URL;

export const MediaModal = ({ isOpen, onClose, material }: MediaModalProps) => {
  const [textContent, setTextContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Nollställ textinnehåll när materialet ändras
    setTextContent('');

    if (material && material.fileKey.toLowerCase().endsWith('.txt')) {
      const fetchTextContent = async () => {
        setIsLoading(true);
        const fullUrl = `${FILE_BASE_URL}/${material.fileKey}`;
        try {
          const response = await axios.get(fullUrl);
          setTextContent(response.data);
        } catch (e) {
          setTextContent("Kunde inte ladda textfilen.");
        } finally {
          setIsLoading(false);
        }
      };
      fetchTextContent();
    }
  }, [material]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen || !material) return null;

  const displayName = material.title || material.fileKey.split('/').pop() || 'Okänd fil';

  const renderContent = () => {
    const fullUrl = `${FILE_BASE_URL}/${material.fileKey}`;
    const normalizedFileKey = material.fileKey.toLowerCase();

    // NYTT: Logik för att rendera videofiler
    if (normalizedFileKey.endsWith('.mp4') || normalizedFileKey.endsWith('.webm') || normalizedFileKey.endsWith('.mov')) {
      return (
        <video 
          src={fullUrl} 
          className={styles.videoPlayer} // Du behöver lägga till denna klass i din .scss-fil
          controls 
          autoPlay
          aria-label={`Videospelare för ${displayName}`}
        >
          Din webbläsare stöder inte video-taggen.
        </video>
      );
    }
    
    if (normalizedFileKey.endsWith('.pdf')) {
      return <iframe src={fullUrl} className={styles.pdfViewer} title={displayName} frameBorder="0" />;
    }
    
    if (normalizedFileKey.endsWith('.txt')) {
      if (isLoading) return <p>Laddar text...</p>;
      return <pre className={styles.textContent}>{textContent}</pre>;
    }
    
    return <p>Filtypen kan inte förhandsvisas. <a href={fullUrl} target="_blank" rel="noopener noreferrer">Öppna i ny flik</a></p>;
  };

  return ReactDOM.createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{displayName}</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Stäng modal">
            <IoClose size={24} />
          </button>
        </header>
        <div className={styles.content}>
          {renderContent()}
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')!
  );
};
