import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Cluster } from '@/components/ui/layout/Cluster';
import { Stack } from '@/components/ui/layout/Stack';
import { Modal } from '@/components/ui/modal/Modal';
import { useAttendanceTracker } from '@/features/attendance';
import { ChevronRight, Info } from 'lucide-react';
import styles from './LeaderAttendancePage.module.scss';

export const LeaderAttendancePage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGuideOpen, setGuideOpen] = useState(false);
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
        <div className={styles.titleRow}>
          <h2>Hantera närvaro</h2>
          <button
            type="button"
            className={styles.infoButton}
            onClick={() => setGuideOpen(true)}
            aria-label="Instruktioner för närvaro"
            aria-expanded={isGuideOpen}
          >
            <Info size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <Cluster>
          {activeSession ? (
            <Button className={styles.takeButton} variant={ButtonVariant.Primary} onClick={() => setIsModalOpen(true)}>
              Visa aktiv kod ({countdownLabel})
            </Button>
          ) : (
            <Button className={styles.takeButton} variant={ButtonVariant.Primary} onClick={openCodeModal}>
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
            <button
              key={day.date}
              type="button"
              className={styles.attendanceCard}
              onClick={() => selectDate(day.date)}
            >
              <span className={styles.cardDate}>
                Närvaro {new Date(day.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}
              </span>
              <ChevronRight className={styles.cardChevron} size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        !daysError && <p className={styles.emptyState}>Inga närvarolistor har skapats ännu.</p>
      )}

      <Modal
        isOpen={isGuideOpen}
        onClose={() => setGuideOpen(false)}
        title="Så tar du närvaron med appen"
      >
        <div className={styles.guideBody}>
          <ol className={styles.guide}>
            <li className={styles.guideStep}>
              <span className={styles.guideNumber}>1</span>
              <div>
                <h3 className={styles.guideTitle}>Starta närvaron</h3>
                <p className={styles.guideText}>
                  Klicka på knappen &quot;Ta närvaro&quot; (eller &quot;Visa aktiv kod&quot;).
                </p>
              </div>
            </li>
            <li className={styles.guideStep}>
              <span className={styles.guideNumber}>2</span>
              <div>
                <h3 className={styles.guideTitle}>Ge koden till körmedlemmarna</h3>
                <p className={styles.guideText}>
                  En 4-siffrig kod skapas som du ger till kören. Koden är giltig i 20 minuter. Behöver du mer tid genererar du bara en ny kod på samma sätt.
                </p>
              </div>
            </li>
            <li className={styles.guideStep}>
              <span className={styles.guideNumber}>3</span>
              <div>
                <h3 className={styles.guideTitle}>Medlemmarna knappar in koden</h3>
                <p className={styles.guideText}>
                  Körmedlemmarna matar in koden i sin app och blir automatiskt registrerade som närvarande.
                </p>
              </div>
            </li>
            <li className={styles.guideStep}>
              <span className={styles.guideNumber}>4</span>
              <div>
                <h3 className={styles.guideTitle}>Hämta och kopiera närvarolistan</h3>
                <p className={styles.guideText}>
                  Klicka på datumet under listor för att se alla närvarande. Klicka sedan på &quot;Kopiera listan&quot; för att kopiera deltagarna och klistra in dem i ditt eget dokument.
                </p>
              </div>
            </li>
          </ol>
          <a
            href="/lathund-narvaro.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.pdfButton}
          >
            📄 Öppna lathund som PDF
          </a>
        </div>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Närvaroregistrering">
        <Stack gap="md" className={styles.codeModal}>
          {isLoadingCode && <p className={styles.codeStatus}>Genererar kod...</p>}
          {startError && <p className={styles.errorMessage}>{startError}</p>}
          {activeSession && (
            <Stack gap="md" className={styles.attendanceCodeDisplay}>
              <p className={styles.codeInstruction}>Ge denna kod till medlemmarna:</p>
              <div className={styles.codeBox}>
                <span className={styles.codeText}>{activeSession.code}</span>
              </div>
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
        <div className={styles.detailsModal}>
          {isLoadingList ? (
            <p className={styles.codeStatus}>Laddar lista...</p>
          ) : (
            <Stack gap="lg">
              {membersError ? (
                <p className={styles.errorMessage}>{membersError}</p>
              ) : (
                <ul className={styles.memberList}>
                  {presentMembers.length > 0 ? (
                    presentMembers.map((member) => (
                      <li key={`${member.familyName}-${member.givenName}`} className={styles.memberRow}>
                        <span className={styles.memberName}>
                          {member.familyName}, {member.givenName}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className={styles.emptyMessage}>Inga medlemmar har anmält sig ännu.</li>
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
        </div>
      </Modal>
    </Stack>
  );
};
