// src/components/member/MemberWeekAccordion.tsx

import { useState, useMemo } from 'react';
import type { Material } from '@/types';
import styles from './MemberWeekAccordion.module.scss';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';

// MaterialCategory-komponenten från din PracticePage.tsx, nu flyttad hit
import { FileText, Music, Video, Download, Eye } from 'lucide-react';
import { FaPlayCircle } from "react-icons/fa";

const S3_PUBLIC_URL = import.meta.env.VITE_S3_BUCKET_URL;

interface MaterialCategoryProps {
  title: string;
  files: Material[];
  onPlay: (file: { url: string; title: string }) => void;
  onView: (material: Material) => void;
}

const MaterialCategory: React.FC<MaterialCategoryProps> = ({ title, files, onPlay, onView }) => {
  if (files.length === 0) return null;

  const getFileIcon = (fileKey: string = '') => {
    const key = fileKey.toLowerCase();
    if (key.match(/\.(mp3|wav|m4a)$/)) return <Music size={20} className={styles.fileIcon} />;
    if (key.match(/\.(mp4|mov|webm)$/)) return <Video size={20} className={styles.fileIcon} />;
    if (key.match(/\.(pdf|txt)$/)) return <FileText size={20} className={styles.fileIcon} />;
    return <Download size={20} className={styles.fileIcon} />;
  };

  const isPlayableAudio = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(mp3|wav|m4a)$/);
  const isViewable = (fileKey: string = '') => fileKey.toLowerCase().match(/\.(pdf|txt|mp4|mov|webm)$/);

  return (
    <section className={styles.categorySection}>
      <h3 className={styles.categoryTitle}>{title}</h3>
      <div className={styles.materialList}>
        {files.map(material => {
          if (!material.fileKey) return null;
          const displayName = material.title || material.fileKey.split('/').pop() || 'Okänd titel';
          const fullUrl = `${S3_PUBLIC_URL}/${material.fileKey}`;

          return (
            <div key={material.materialId} className={styles.materialItem}>
              <div className={styles.itemInfo}>
                {getFileIcon(material.fileKey)}
                <span className={styles.materialTitle}>{displayName}</span>
              </div>
              <div className={styles.actions}>
                {isPlayableAudio(material.fileKey) && (
                  <button onClick={() => onPlay({ url: fullUrl, title: displayName })} className={`${styles.actionButton} ${styles.playButton}`} aria-label={`Spela ${displayName}`}>
                    <FaPlayCircle size={30} />
                  </button>
                )}
                {isViewable(material.fileKey) && !isPlayableAudio(material.fileKey) && (
                  <button onClick={() => onView(material)} className={`${styles.actionButton} ${styles.viewButton}`} aria-label={`Visa ${displayName}`}>
                    <Eye size={30} />
                  </button>
                )}
                 {!isPlayableAudio(material.fileKey) && !isViewable(material.fileKey) && (
                  <a href={fullUrl} target="_blank" rel="noopener noreferrer" className={styles.actionButton} aria-label={`Ladda ner ${displayName}`}>
                    <Download size={22} />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

// Själva Accordion-komponenten
interface MemberWeekAccordionProps {
  weekId: string;
  materials: Material[];
  defaultOpen?: boolean;
  onPlay: (file: { url: string; title: string }) => void;
  onView: (material: Material) => void;
}

export const MemberWeekAccordion = ({ weekId, materials, defaultOpen = false, onPlay, onView }: MemberWeekAccordionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const { audioFiles, videoFiles, documentFiles, otherFiles } = useMemo(() => {
    const isAudio = (key = '') => key.toLowerCase().match(/\.(mp3|wav|m4a)$/i);
    const isVideo = (key = '') => key.toLowerCase().match(/\.(mp4|mov|webm)$/i);
    const isDocument = (key = '') => key.toLowerCase().match(/\.(pdf|txt|doc|docx)$/i);
    return {
      audioFiles: materials.filter(m => isAudio(m.fileKey)),
      videoFiles: materials.filter(m => isVideo(m.fileKey)),
      documentFiles: materials.filter(m => isDocument(m.fileKey)),
      otherFiles: materials.filter(m => !isAudio(m.fileKey) && !isVideo(m.fileKey) && !isDocument(m.fileKey)),
    };
  }, [materials]);

  const weekNumber = weekId.split('-W')[1];
  const year = weekId.split('-W')[0];

  return (
    <div className={styles.accordion}>
      <button className={styles.header} onClick={() => setIsOpen(!isOpen)}>
        <div className={styles.headerTitle}>
          <span>Vecka {weekNumber}</span>
          <span className={styles.year}>{year}</span>
        </div>
        {isOpen ? <FiChevronUp /> : <FiChevronDown />}
      </button>
      
      {isOpen && (
        <div className={styles.content}>
          <MaterialCategory title="Ljudfiler" files={audioFiles} onPlay={onPlay} onView={onView} />
          <MaterialCategory title="Videor" files={videoFiles} onPlay={onPlay} onView={onView} />
          <MaterialCategory title="Dokument & Texter" files={documentFiles} onPlay={onPlay} onView={onView} />
          <MaterialCategory title="Övrigt" files={otherFiles} onPlay={onPlay} onView={onView} />
        </div>
      )}
    </div>
  );
};