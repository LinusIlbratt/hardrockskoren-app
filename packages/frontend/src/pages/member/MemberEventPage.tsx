import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Modal } from '@/components/ui/modal/Modal';
import { IoEyeOutline, IoInformationCircleOutline } from 'react-icons/io5';
import { format, isPast } from 'date-fns';
import { sv } from 'date-fns/locale';
import styles from './MemberEventPage.module.scss';
import type { Event } from '@/types';
import { useEventNotification } from '@/hooks/useEventNotification';

const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;

export const MemberEventPage = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventToShowDescription, setEventToShowDescription] = useState<Event | null>(null);
  const [activeTab, setActiveTab] = useState<'REHEARSAL' | 'CONCERT' | 'OTHER'>('REHEARSAL');
  const [nextUpcomingEventId, setNextUpcomingEventId] = useState<string | null>(null);

  const { groupName } = useParams<{ groupName: string }>();

  const { notificationData, markNewEventAsRead, markUpdateAsSeen } = useEventNotification(groupName);

  const fetchEvents = useCallback(async () => {
    if (!groupName) {
      setIsLoading(false);
      setError("Kunde inte identifiera din kör.");
      return;
    }
    setIsLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    try {
      const url = `${API_BASE_URL}/groups/${groupName}/events`;
      const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      const sortedEvents = response.data.sort((a: Event, b: Event) =>
        new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
      );
      setEvents(sortedEvents);

      const nextEvent = sortedEvents.find((event: Event) => !isPast(new Date(event.endDate)));
      if (nextEvent) {
        setNextUpcomingEventId(nextEvent.eventId);
      }

    } catch (err) {
      setError("Kunde inte hämta event.");
    } finally {
      setIsLoading(false);
    }
  }, [groupName]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const rehearsals = events.filter(e => e.eventType === 'REHEARSAL');
  const concerts = events.filter(e => e.eventType === 'CONCERT');
  const others = events.filter(e => e.eventType !== 'REHEARSAL' && e.eventType !== 'CONCERT');

  // --- Logik för att avgöra om en flik ska ha en notis-prick ---
  const allNotificationIds = new Set([
    ...notificationData.newEventIds,
    ...Object.keys(notificationData.updatedEvents)
  ]);

  const hasRehearsalNotification = rehearsals.some(event => allNotificationIds.has(event.eventId));
  const hasConcertNotification = concerts.some(event => allNotificationIds.has(event.eventId));
  const hasOtherNotification = others.some(event => allNotificationIds.has(event.eventId));
  // --- Slut på logik för flik-notiser ---

  const renderEventItem = (event: Event) => {
    const startDate = new Date(event.eventDate);
    const endDate = new Date(event.endDate);
    const hasEventPassed = isPast(endDate);
    const isNextUpcoming = event.eventId === nextUpcomingEventId;

    const isNew = notificationData.newEventIds.includes(event.eventId);
    const updatedFields = notificationData.updatedEvents[event.eventId];
    const hasUnreadUpdate = !!updatedFields;

    const handleItemClick = () => {
      if (isNew) {
        markNewEventAsRead(event.eventId);
      } else if (hasUnreadUpdate) {
        markUpdateAsSeen(event.eventId, event.updatedAt);
      }
    };

    const showRedEye = event.description && (isNew || updatedFields?.includes('description'));
    const pulseTitle = updatedFields?.includes('title');
    const pulseDate = updatedFields?.includes('eventDate') || updatedFields?.includes('endDate');
    const pulseTime = updatedFields?.includes('startTime') || updatedFields?.includes('endTime');

    const classNames = [
      styles.eventItem,
      hasEventPassed ? styles.pastEvent : '',
      isNextUpcoming ? styles.nextUpcomingEvent : '',
      (isNew || hasUnreadUpdate) ? styles.hasNotification : '',
      isNew ? styles.newEvent : '',
      hasUnreadUpdate ? styles.updatedEvent : ''
    ].filter(Boolean).join(' ');

    return (
      <li
        key={event.eventId}
        className={classNames}
        onClick={handleItemClick}
      >
        <div className={styles.calendarBlock}>
          <span className={pulseDate ? styles.pulsingText : ''}>{format(startDate, "MMM", { locale: sv })}</span>
          <span className={pulseDate ? styles.pulsingText : ''}>{format(startDate, "d")}</span>
        </div>
        <div className={styles.itemDetails}>
          <span className={`${styles.itemTitle} ${pulseTitle ? styles.pulsingText : ''}`}>{event.title}</span>
          <span className={`${styles.itemTime} ${pulseTime ? styles.pulsingText : ''}`}>{`kl. ${format(startDate, 'HH:mm')} – ${format(endDate, 'HH:mm')}`}</span>
        </div>
        <div className={styles.actions}>
          {event.description && (
            <button
              className={`${styles.iconButton} ${showRedEye ? styles.pulsingRedEye : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleItemClick();
                setEventToShowDescription(event);
              }}
              title="Visa beskrivning"
            >
              <IoEyeOutline size={32} />
            </button>
          )}
        </div>
      </li>
    );
  };

  const getEventsToDisplay = () => {
    switch (activeTab) {
      case 'REHEARSAL': return rehearsals;
      case 'CONCERT': return concerts;
      case 'OTHER': return others;
      default: return [];
    }
  };

  const eventsToDisplay = getEventsToDisplay();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Konsert & Repdatum</h2>
        <div className={styles.tabs}>
          <button className={`${styles.tabButton} ${activeTab === 'REHEARSAL' ? styles.activeTab : ''}`} onClick={() => setActiveTab('REHEARSAL')}>
            Repetitioner
            {hasRehearsalNotification && <span className={styles.tabBadge} />}
          </button>
          <button className={`${styles.tabButton} ${activeTab === 'CONCERT' ? styles.activeTab : ''}`} onClick={() => setActiveTab('CONCERT')}>
            Konserter
            {hasConcertNotification && <span className={styles.tabBadge} />}
          </button>
          {others.length > 0 && (
            <button className={`${styles.tabButton} ${activeTab === 'OTHER' ? styles.activeTab : ''}`} onClick={() => setActiveTab('OTHER')}>
              Övrigt
              {hasOtherNotification && <span className={styles.tabBadge} />}
            </button>
          )}
        </div>
      </div>
      <div className={styles.legend}>
        <IoInformationCircleOutline size={20} className={styles.legendIcon} />
        <p className={styles.legendText}>
          Tryck på ögat <IoEyeOutline size={20} className={styles.inlineIcon} /> för att läsa mer.
          Nya event har en ljusare bakgrund, medan en pulserande detalj visar exakt vad som har ändrats.
          Klicka på ett markerat event för att markera det som läst.
        </p>
      </div>
      {isLoading && <p>Laddar kommande händelser...</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!isLoading && !error && (
        <section className={styles.listSection}>
          {eventsToDisplay.length > 0 ? (<ul className={styles.eventList}>{eventsToDisplay.map(renderEventItem)}</ul>) : (<p>Det finns inga inplanerade händelser ännu.</p>)}
        </section>
      )}
      <Modal isOpen={!!eventToShowDescription} onClose={() => setEventToShowDescription(null)} title={eventToShowDescription?.title || "Eventbeskrivning"}>
        <div><pre className={styles.descriptionText}>{eventToShowDescription?.description}</pre></div>
      </Modal>
    </div>
  );
};