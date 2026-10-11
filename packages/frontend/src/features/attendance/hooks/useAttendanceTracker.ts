import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage, isAbortError } from '@/utils/apiError';
import {
  getAttendanceStatus,
  listAttendanceDays,
  listPresentMembers,
  startAttendanceSession,
  type AttendanceDay,
  type AttendanceSession,
  type PresentMember,
} from '@/services/attendanceService';

const POLL_INTERVAL_MS = 5000;

function formatCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      if (typeof document === 'undefined') throw error;
    }
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } finally {
    document.body.removeChild(textArea);
  }
  if (!copied) {
    throw new Error('Kunde inte kopiera listan.');
  }
}

export function useAttendanceTracker(groupSlug: string | undefined) {
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isLoadingCode, setIsLoadingCode] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [attendanceDays, setAttendanceDays] = useState<AttendanceDay[]>([]);
  const [isLoadingDays, setIsLoadingDays] = useState(true);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [presentMembers, setPresentMembers] = useState<PresentMember[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const slugRef = useRef(groupSlug);
  slugRef.current = groupSlug;
  const overviewGenRef = useRef(0);
  const copyTimerRef = useRef<number | null>(null);

  const clearCopyTimer = useCallback(() => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearCopyTimer(), [clearCopyTimer]);

  useEffect(() => {
    setSelectedDate(null);
    setPresentMembers([]);
    setMembersError(null);
    setActiveSession(null);
    setStartError(null);
    setStatusError(null);
    setDaysError(null);

    if (!groupSlug) {
      setIsLoadingDays(false);
      setDaysError('Kunde inte identifiera kören.');
      return undefined;
    }

    const controller = new AbortController();
    const slug = groupSlug;
    const gen = ++overviewGenRef.current;
    let disposed = false;
    setIsLoadingDays(true);

    const stillCurrent = () => !disposed && gen === overviewGenRef.current && slugRef.current === slug;

    const loadOverview = async () => {
      try {
        const days = await listAttendanceDays(slug, { signal: controller.signal });
        if (!stillCurrent()) return;
        setAttendanceDays(days);
        setDaysError(null);
      } catch (error) {
        if (!stillCurrent() || isAbortError(error)) return;
        setAttendanceDays([]);
        setDaysError(getApiErrorMessage(error, 'Kunde inte hämta närvarolistor.'));
      } finally {
        if (!disposed && slugRef.current === slug) setIsLoadingDays(false);
      }

      try {
        const session = await getAttendanceStatus(slug, { signal: controller.signal });
        if (!stillCurrent()) return;
        setActiveSession(session);
        setStatusError(null);
      } catch (error) {
        if (!stillCurrent() || isAbortError(error)) return;
        setStatusError(getApiErrorMessage(error, 'Kunde inte hämta närvarostatus.'));
      }
    };

    void loadOverview();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [groupSlug]);

  useEffect(() => {
    if (!activeSession) {
      setCountdown(0);
      return undefined;
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        activeSession.expiresAt - Math.floor(Date.now() / 1000)
      );
      setCountdown(remaining);
      if (remaining <= 0) setActiveSession(null);
    };

    tick();
    const timerId = window.setInterval(tick, 1000);
    return () => window.clearInterval(timerId);
  }, [activeSession]);

  useEffect(() => {
    if (!groupSlug || !selectedDate) return undefined;

    const controller = new AbortController();
    const slug = groupSlug;
    const date = selectedDate;
    let disposed = false;
    let latestRequest = 0;

    const loadMembers = async (isInitial: boolean) => {
      const requestId = ++latestRequest;
      if (isInitial) setIsLoadingList(true);
      try {
        const members = await listPresentMembers(slug, date, { signal: controller.signal });
        if (disposed || requestId !== latestRequest || slugRef.current !== slug) return;
        setPresentMembers(members);
        setMembersError(null);
      } catch (error) {
        if (disposed || requestId !== latestRequest || slugRef.current !== slug || isAbortError(error)) {
          return;
        }
        setMembersError(getApiErrorMessage(error, 'Kunde inte hämta närvarolista.'));
        if (isInitial) setPresentMembers([]);
      } finally {
        if (!disposed && requestId === latestRequest && isInitial) {
          setIsLoadingList(false);
        }
      }
    };

    void loadMembers(true);
    const intervalId = window.setInterval(() => {
      void loadMembers(false);
    }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      latestRequest += 1;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [groupSlug, selectedDate]);

  const startAttendance = useCallback(async () => {
    const slug = groupSlug?.trim();
    if (!slug) {
      setStartError('Kunde inte identifiera kören.');
      return;
    }
    setIsLoadingCode(true);
    setStartError(null);
    try {
      const session = await startAttendanceSession(slug);
      if (slugRef.current !== groupSlug) return;
      setActiveSession(session);
      const gen = ++overviewGenRef.current;
      const days = await listAttendanceDays(slug);
      if (gen !== overviewGenRef.current || slugRef.current !== groupSlug) return;
      setAttendanceDays(days);
      setDaysError(null);
    } catch (error) {
      if (slugRef.current !== groupSlug || isAbortError(error)) return;
      setStartError(getApiErrorMessage(error, 'Kunde inte starta närvaro.'));
    } finally {
      if (slugRef.current === groupSlug) setIsLoadingCode(false);
    }
  }, [groupSlug]);

  const selectDate = useCallback((date: string | null) => {
    clearCopyTimer();
    setCopySuccess(false);
    setCopyError(null);
    setMembersError(null);
    setPresentMembers([]);
    setSelectedDate(date);
    setIsLoadingList(Boolean(date));
  }, [clearCopyTimer]);

  const copyList = useCallback(async () => {
    if (presentMembers.length === 0) return;
    const text = presentMembers
      .map((member) => `${member.familyName}, ${member.givenName}`)
      .join('\n');
    setCopyError(null);
    try {
      await writeClipboard(text);
      setCopySuccess(true);
      clearCopyTimer();
      copyTimerRef.current = window.setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      setCopySuccess(false);
      setCopyError(getApiErrorMessage(error, 'Kunde inte kopiera listan.'));
    }
  }, [clearCopyTimer, presentMembers]);

  return {
    activeSession,
    countdownLabel: formatCountdown(countdown),
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
  };
}
