import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Cluster } from '@/components/ui/layout/Cluster';
import { Stack } from '@/components/ui/layout/Stack';
import { Modal } from '@/components/ui/modal/Modal';
import { useAttendanceTracker } from '@/features/attendance';
import styles from './LeaderAttendancePage.module.scss';

export const LeaderAttendancePage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    activeSession,
    countdownLabel,
    isLoadingCode,
    startError,
    attendanceDays,
    isLoadingDays,
    daysError,
    statusError,
    selectedDate,
    presentMembers,
    isLoadingList,
    membersError,
    copySuccess,
    copyError,
    startAttendance,
    selectDate,
    copyList,
  } = useAttendanceTracker(groupName);

  const openCodeModal = () => {
    setIsModalOpen(true);
    if (!activeSession) {
      void startAttendance();
    }
  };

  return (
    <Stack gap="xl" className={styles.page}>
      <Stack gap="md" align="start" className={styles.header}>
        <h2>Hantera närvaro</h2>
        <Cluster>
          {activeSession ? (
            <Button variant={ButtonVariant.Primary} onClick={() => setIsModalOpen(true)}>
              Visa aktiv kod ({countdownLabel})
            </Button>
          ) : (
            <Button variant={ButtonVariant.Primary} onClick={openCodeModal}>
              Ta närvaro
            </Button>
          )}
        </Cluster>
      </Stack>

      {statusError && <p className={styles.errorMessage}>{statusError}</p>}
      {daysError && <p className={styles.errorMessage}>{daysError}</p>}

      {isLoadingDays ? (
        <p>Laddar närvarolistor...</p>
      ) : attendanceDays.length > 0 ? (
        <div className={styles.attendanceListContainer}>
          {attendanceDays.map((day) => (
            <div
              key={day.date}
              className={styles.attendanceCard}
              onClick={() => selectDate(day.date)}
            >
              <span className={styles.cardDate}>
                Närvaro {new Date(day.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}
              </span>
            </div>
          ))}
        </div>
      ) : (
        !daysError && <p>Inga närvarolistor har skapats ännu.</p>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Närvaroregistrering">
        <Stack gap="md">
          {isLoadingCode && <p>Genererar kod...</p>}
          {startError && <p className={styles.errorMessage}>{startError}</p>}
          {activeSession && (
            <Stack gap="md" className={styles.attendanceCodeDisplay}>
              <p>Ge denna kod till medlemmarna:</p>
              <div className={styles.codeBox}>{activeSession.code}</div>
              <p className={styles.timerText}>
                Koden är giltig i: <span className={styles.countdownValue}>{countdownLabel}</span>
              </p>
            </Stack>
          )}
        </Stack>
      </Modal>

      <Modal
        isOpen={!!selectedDate}
        onClose={() => selectDate(null)}
        title={`Närvarande ${selectedDate ? new Date(selectedDate).toLocaleDateString('sv-SE') : ''}`}
      >
        {isLoadingList ? (
          <p>Laddar lista...</p>
        ) : (
          <Stack gap="lg">
            {membersError ? (
              <p className={styles.errorMessage}>{membersError}</p>
            ) : (
              <ul className={styles.memberList}>
                {presentMembers.length > 0 ? (
                  presentMembers.map((member) => (
                    <li key={`${member.familyName}-${member.givenName}`}>
                      {member.familyName}, {member.givenName}
                    </li>
                  ))
                ) : (
                  <li>Inga medlemmar har anmält sig ännu.</li>
                )}
              </ul>
            )}
            {presentMembers.length > 0 && (
              <Cluster justify="end" className={styles.modalFooter}>
                <Button onClick={() => { void copyList(); }} variant={ButtonVariant.Primary}>
                  {copySuccess ? 'Kopierat!' : 'Kopiera listan'}
                </Button>
              </Cluster>
            )}
            {copyError && <p className={styles.errorMessage}>{copyError}</p>}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
};
