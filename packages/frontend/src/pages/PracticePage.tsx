import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FaPlayCircle } from 'react-icons/fa';
import { IoEyeOutline, IoInformationCircleOutline } from 'react-icons/io5';
import { MediaModal } from '@/components/media/MediaModal';
import { MemberWeekAccordion } from '@/components/member/MemberWeekAccordion';
import { Cluster } from '@/components/ui/layout/Cluster';
import { Stack } from '@/components/ui/layout/Stack';
import type { MusicPlayerViewer } from '@/context/MusicPlayerOverlayContext';
import { useMusicPlayerOverlay } from '@/context/MusicPlayerOverlayContext';
import { usePracticeView } from '@/features/practice';
import type { Material } from '@/types';
import { isPlayableAudioFile } from '@/utils/media';
import styles from './PracticePage.module.scss';

type PracticePageProps = {
  /** Routens tittare. Utan prop används rollen i auth-context. */
  viewer?: MusicPlayerViewer;
};

export const PracticePage = ({ viewer }: PracticePageProps) => {
  const { groupName } = useParams<{ groupName: string }>();
  const { openLibraryPlayer } = useMusicPlayerOverlay();
  const { weeklyMaterials, isLoading, error, viewer: resolvedViewer } = usePracticeView(groupName, viewer);
  const [materialToView, setMaterialToView] = useState<Material | null>(null);

  const handlePlayMaterial = useCallback(
    (material: Material) => {
      const choir = groupName?.trim();
      if (!choir || !material.fileKey?.trim() || !isPlayableAudioFile(material.fileKey)) return;
      openLibraryPlayer(
        choir,
        resolvedViewer,
        [material],
        { type: 'fromIndex', index: 0 },
        { startMinimized: true, withRepertoireBrowser: true }
      );
    },
    [groupName, resolvedViewer, openLibraryPlayer]
  );

  if (isLoading) {
    return (
      <Stack gap="xl" className={styles.page}>
        <p>Laddar övningar...</p>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap="xl" className={styles.page}>
        <p className={styles.errorMessage}>{error}</p>
      </Stack>
    );
  }

  return (
    <Stack gap="xl" className={styles.page}>
      <Stack gap="xs" className={styles.header}>
        <h2>Sjung upp</h2>
        <p>Här hittar du övningsmaterial för den här veckan och tidigare veckor.</p>
      </Stack>

      <Cluster align="start" gap="md" className={styles.legend}>
        <IoInformationCircleOutline size={20} className={styles.legendIcon} />
        <p className={styles.legendText}>
          Tryck på ikonerna <IoEyeOutline size={20} className={styles.inlineIcon} /><FaPlayCircle size={20} className={styles.inlinePlayIcon} /> för att öppna/spela upp filen.
          Ljud spelas i samma musikspelare som under Material (minispelare längst ned).
        </p>
      </Cluster>

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
    </Stack>
  );
};
