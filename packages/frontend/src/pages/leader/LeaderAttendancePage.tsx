import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import styles from './LeaderAttendancePage.module.scss';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

interface ActiveSession {
  code: string;
  expiresAt: number;
}

interface AttendanceDay {
  date: string;
}

interface PresentMember {
  givenName: string;
  familyName: string;
}

export const LeaderAttendancePage = () => {
  const { groupName } = useParams<{ groupName: string }>();

  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingCode, setIsLoadingCode] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [attendanceDays, setAttendanceDays] = useState<AttendanceDay[]>([]);
  const [selectedDay, setSelectedDay] = useState<AttendanceDay | null>(null);
  const [presentMembers, setPresentMembers] = useState<PresentMember[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyList = () => {
    if (presentMembers.length === 0) return;
    const nameListString = presentMembers
      .map(member => `${member.familyName}, ${member.givenName}`)
      .join('\n');
    const textArea = document.createElement('textarea');
    textArea.value = nameListString;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Kunde inte kopiera text: ', err);
    }
    document.body.removeChild(textArea);
  };

  const fetchAttendanceDays = useCallback(async () => {
    if (!groupName) return;
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/attendance/days`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAttendanceDays(response.data.attendanceDays || []);
    } catch (error) {
      console.error("Failed to fetch attendance days:", error);
    }
  }, [groupName]);

  useEffect(() => {
    const checkStatusAndFetchDays = async () => {
      if (!groupName) return;
      await fetchAttendanceDays();
      try {
        const token = localStorage.getItem('authToken');
        const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/attendance/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.data.isActive) {
          setActiveSession({
            code: response.data.attendanceCode,
            expiresAt: response.data.expiresAt,
          });
        }
      } catch (error) {
        console.error("Failed to check attendance status on load:", error);
      }
    };
    checkStatusAndFetchDays();
  }, [groupName, fetchAttendanceDays]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;
    if (activeSession) {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const initialCountdown = Math.max(0, activeSession.expiresAt - nowInSeconds);
      setCountdown(initialCountdown);
      if (initialCountdown > 0) {
        timerId = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timerId!);
              setActiveSession(null);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setActiveSession(null);
      }
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [activeSession]);

  const handleStartAttendance = async () => {
    setIsModalOpen(true);
    setIsLoadingCode(true);
    setStartError(null);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.post(`${API_BASE_URL}/groups/${groupName}/attendance/start`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setActiveSession({
        code: response.data.attendanceCode,
        expiresAt: response.data.expiresAt,
      });
      await fetchAttendanceDays();
    } catch (err: any) {
      setStartError(err.response?.data?.message || 'Kunde inte starta närvaro.');
    } finally {
      setIsLoadingCode(false);
    }
  };

  const fetchPresentMembers = useCallback(async (date: string, isInitialLoad = false) => {
    if (!groupName) return;
    if (isInitialLoad) setIsLoadingList(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/attendance/${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const members: PresentMember[] = response.data.presentMembers || [];
      members.sort((a, b) => 
        a.familyName.localeCompare(b.familyName, 'sv')
      );
      
      setPresentMembers(members);
    } catch (error) {
      console.error("Kunde inte hämta närvarolista:", error);
      setPresentMembers([]);
    } finally {
      if (isInitialLoad) setIsLoadingList(false);
    }
  }, [groupName]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    if (selectedDay) {
      fetchPresentMembers(selectedDay.date, true);
      intervalId = setInterval(() => {
        fetchPresentMembers(selectedDay.date, false);
      }, 5000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedDay, fetchPresentMembers]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Hantera närvaro</h2>
        {activeSession ? (
          <Button variant={ButtonVariant.Primary} onClick={() => setIsModalOpen(true)}>
            Visa aktiv kod ({formatTime(countdown)})
          </Button>
        ) : (
          <Button variant={ButtonVariant.Primary} onClick={handleStartAttendance}>
            Ta närvaro
          </Button>
        )}
      </div>

      <div className={styles.attendanceListContainer}>
        {attendanceDays.length > 0 ? (
          attendanceDays.map(day => (
            <div key={day.date} className={styles.attendanceCard} onClick={() => setSelectedDay(day)}>
              {/* FIX: Korrigerat stavfel här */}
              <span className={styles.cardDate}>Närvaro {new Date(day.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })}</span>
            </div>
          ))
        ) : (
          <p>Inga närvarolistor har skapats ännu.</p>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Närvaroregistrering">
        {isLoadingCode && <p>Genererar kod...</p>}
        {startError && <p className={styles.errorMessage}>{startError}</p>}
        {activeSession && (
          <div className={styles.attendanceCodeDisplay}>
            <p>Ge denna kod till medlemmarna:</p>
            <div className={styles.codeBox}>{activeSession.code}</div>
            <p className={styles.timerText}>
              Koden är giltig i: <span className={styles.countdownValue}>{formatTime(countdown)}</span>
            </p>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!selectedDay} onClose={() => setSelectedDay(null)} title={`Närvarande ${selectedDay ? new Date(selectedDay.date).toLocaleDateString('sv-SE') : ''}`}>
        {isLoadingList ? (
          <p>Laddar lista...</p>
        ) : (
          <>
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
            {presentMembers.length > 0 && (
              <div className={styles.modalFooter}>
                <Button
                  onClick={handleCopyList}
                  variant={ButtonVariant.Primary}
                >
                  {copySuccess ? 'Kopierat!' : 'Kopiera listan'}
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};