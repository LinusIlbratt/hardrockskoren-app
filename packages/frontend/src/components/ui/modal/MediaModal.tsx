import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';
import type { Material } from '@/types/index';
import styles from './MediaModal.module.scss';
import { IoClose } from 'react-icons/io5';
import { useMediaDownloadUrl } from '@/hooks/useMediaDownloadUrl';

interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  material: Material | null;
}

export const MediaModal = ({ isOpen, onClose, material }: MediaModalProps) => {
  const [textContent, setTextContent] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const { url: mediaUrl, isLoading: urlLoading, error: urlError } = useMediaDownloadUrl(
    isOpen && material?.fileKey ? material.fileKey : undefined
  );

  useEffect(() => {
    setTextContent('');

    if (material && mediaUrl && material.fileKey.toLowerCase().endsWith('.txt')) {
      const fetchTextContent = async () => {
        setTextLoading(true);
        try {
          const response = await axios.get(mediaUrl);
          setTextContent(response.data);
        } catch {
          setTextContent('Kunde inte ladda textfilen.');
        } finally {
          setTextLoading(false);
        }
      };
      void fetchTextContent();
    }
  }, [material, mediaUrl]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen || !material) return null;

  const displayName = material.title || material.fileKey.split('/').pop() || 'Okänd fil';
  const normalizedFileKey = material.fileKey.toLowerCase();

  const renderContent = () => {
    if (urlLoading) {
      return <p>Laddar media...</p>;
    }
    if (urlError || !mediaUrl) {
      return <p>{urlError ?? 'Kunde inte ladda filen.'}</p>;
    }

    if (
      normalizedFileKey.endsWith('.mp4') ||
      normalizedFileKey.endsWith('.webm') ||
      normalizedFileKey.endsWith('.mov')
    ) {
      return (
        <video
          src={mediaUrl}
          className={styles.videoPlayer}
          controls
          autoPlay
          aria-label={`Videospelare för ${displayName}`}
        >
          Din webbläsare stöder inte video-taggen.
        </video>
      );
    }

    if (normalizedFileKey.endsWith('.pdf')) {
      const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(mediaUrl)}&embedded=true`;
      return (
        <iframe
          src={viewerUrl}
          className={styles.pdfViewer}
          title={displayName}
          frameBorder="0"
        />
      );
    }

    if (normalizedFileKey.endsWith('.txt')) {
      if (textLoading) return <p>Laddar text...</p>;
      return <pre className={styles.textContent}>{textContent}</pre>;
    }

    return <p>Den här filtypen kan bara användas i appen och kan inte förhandsvisas här.</p>;
  };

  const mount =
    typeof document !== 'undefined'
      ? document.getElementById('modal-root') ?? document.body
      : null;
  if (!mount) return null;

  return ReactDOM.createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title}>{displayName}</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Stäng modal">
            <IoClose size={24} />
          </button>
        </header>
        <div className={styles.content}>{renderContent()}</div>
      </div>
    </div>,
    mount
  );
};
