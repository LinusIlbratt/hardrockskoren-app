// src/pages/PracticePage.tsx

import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import type { Material } from '@/types';
import { MediaModal } from '@/components/ui/modal/MediaModal';
import styles from './PracticePage.module.scss';
import { MemberWeekAccordion } from '@/components/member/MemberWeekAccordion';
import { IoInformationCircleOutline, IoEyeOutline } from 'react-icons/io5';
import { FaPlayCircle } from 'react-icons/fa';
import { useMusicPlayerOverlay, type MusicPlayerViewer } from '@/context/MusicPlayerOverlayContext';
import { isPlayableAudioFile } from '@/utils/media';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

interface WeekGroup {
  weekId: string;
  materials: Material[];
}

function musicViewerFromPathname(pathname: string): MusicPlayerViewer {
  if (pathname.startsWith('/admin/')) return 'admin';
  if (pathname.startsWith('/leader/')) return 'leader';
  return 'member';
}

export const PracticePage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const { pathname } = useLocation();
  const { openLibraryPlayer } = useMusicPlayerOverlay();
  const viewer = musicViewerFromPathname(pathname);

  const [weeklyMaterials, setWeeklyMaterials] = useState<WeekGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [materialToView, setMaterialToView] = useState<Material | null>(null);

  const fetchMaterials = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    if (!token) {
      setError("Du måste vara inloggad för att se detta material.");
      setIsLoading(false);
      return;
    }
    try {
      const response = await axios.get<WeekGroup[]>(`${API_BASE_URL}/practice/materials/member-view`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWeeklyMaterials(response.data);
    } catch (err) {
      setError('Kunde inte hämta övningsmaterial. Försök igen senare.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const handlePlayMaterial = useCallback(
    (material: Material) => {
      const g = groupName?.trim();
      if (!g || !material.fileKey?.trim() || !isPlayableAudioFile(material.fileKey)) return;
      openLibraryPlayer(
        g,
        viewer,
        [material],
        { type: 'fromIndex', index: 0 },
        { startMinimized: true, withRepertoireBrowser: true }
      );
    },
    [groupName, viewer, openLibraryPlayer]
  );

  if (isLoading) {
    return <div className={styles.page}><p>Laddar övningar...</p></div>;
  }

  if (error) {
    return <div className={styles.page}><p className={styles.errorMessage}>{error}</p></div>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2>Sjung upp</h2>
        <p>Här hittar du övningsmaterial för den här veckan och tidigare veckor.</p>
      </header>

      <div className={styles.legend}>
        <IoInformationCircleOutline size={20} className={styles.legendIcon} />
        <p className={styles.legendText}>
          Tryck på ikonerna <IoEyeOutline size={20} className={styles.inlineIcon} /><FaPlayCircle size={20} className={styles.inlinePlayIcon} /> för att öppna/spela upp filen.
          Ljud spelas i samma musikspelare som under Material (minispelare längst ned).
        </p>
      </div>

      {weeklyMaterials.length > 0 ? (
        <div className={styles.accordionContainer}>
          {weeklyMaterials.map((week, index) => (
            <MemberWeekAccordion
              key={week.weekId}
              weekId={week.weekId}
              materials={week.materials}
              defaultOpen={index === 0}
              onPlay={handlePlayMaterial}
              onView={setMaterialToView}
            />
          ))}
        </div>
      ) : (
        <p>Det finns inget Sjungupp-material uppladdat ännu.</p>
      )}

      {materialToView && (
        <MediaModal
          isOpen={!!materialToView}
          onClose={() => setMaterialToView(null)}
          material={materialToView}
        />
      )}
    </div>
  );
};
