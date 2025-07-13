import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Modal } from '@/components/ui/modal/Modal';
import { IoEyeOutline, IoInformationCircleOutline } from 'react-icons/io5';
import { format, isPast } from 'date-fns';
import { sv } from 'date-fns/locale';
import styles from './MemberEventPage.module.scss';
import type { Event } from '@/types';

const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;

export const MemberEventPage = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventToShowDescription, setEventToShowDescription] = useState<Event | null>(null);
  const [activeTab, setActiveTab] = useState<'REHEARSAL' | 'CONCERT' | 'OTHER'>('REHEARSAL');
  
  // ✅ NYTT: State för att hålla ID på nästa event
  const [nextUpcomingEventId, setNextUpcomingEventId] = useState<string | null>(null);
  
  const { groupName } = useParams<{ groupName: string }>();

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

      // ✅ NYTT: Hitta det första kommande eventet efter att datan har hämtats och sorterats
      const nextEvent = sortedEvents.find((event: Event) => !isPast(new Date(event.endDate || event.eventDate)));
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

  const renderEventItem = (event: Event) => {
    const startDate = new Date(event.eventDate);
    const endDate = event.endDate ? new Date(event.endDate) : startDate;
    const hasEventPassed = isPast(endDate);
    // ✅ NYTT: Kontrollera om detta är nästa event
    const isNextUpcoming = event.eventId === nextUpcomingEventId;

    return (
      // ✅ NYTT: Lägg till en villkorlig klass
      <li key={event.eventId} className={`${styles.eventItem} ${hasEventPassed ? styles.pastEvent : ''} ${isNextUpcoming ? styles.nextUpcomingEvent : ''}`}>
        <div className={styles.calendarBlock}>
          <span className={styles.month}>{format(startDate, "MMM", { locale: sv })}</span>
          <span className={styles.day}>{format(startDate, "d")}</span>
        </div>
        <div className={styles.itemDetails}>
          <span className={styles.itemTitle}>{event.title}</span>
          <span className={styles.itemTime}>
            {`kl. ${format(startDate, 'HH:mm')} – ${format(endDate, 'HH:mm')}`}
          </span>
        </div>
        <div className={styles.actions}>
          {event.description && (
            <button className={styles.iconButton} onClick={() => setEventToShowDescription(event)} title="Visa beskrivning">
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
          </button>
          <button className={`${styles.tabButton} ${activeTab === 'CONCERT' ? styles.activeTab : ''}`} onClick={() => setActiveTab('CONCERT')}>
            Konserter
          </button>
          {others.length > 0 && (
            <button className={`${styles.tabButton} ${activeTab === 'OTHER' ? styles.activeTab : ''}`} onClick={() => setActiveTab('OTHER')}>
              Övrigt
            </button>
          )}
        </div>
      </div>

      <div className={styles.legend}>
        <IoInformationCircleOutline size={20} className={styles.legendIcon} />
        <p className={styles.legendText}>
          Tryck på ögat-ikonen <IoEyeOutline size={20} className={styles.inlineIcon} /> för att läsa mer information om ett event.
        </p>
      </div>

      {isLoading && <p>Laddar kommande händelser...</p>}
      {error && <p className={styles.error}>{error}</p>}
      
      {!isLoading && !error && (
        <section className={styles.listSection}>
          {eventsToDisplay.length > 0 ? (
            <ul className={styles.eventList}>
              {eventsToDisplay.map(renderEventItem)}
            </ul>
          ) : (
            <p>Det finns inga inplanerade händelser ännu.</p>
          )}
        </section>
      )}

      <Modal isOpen={!!eventToShowDescription} onClose={() => setEventToShowDescription(null)} title={eventToShowDescription?.title || "Eventbeskrivning"}>
        <div>
          <pre className={styles.descriptionText}>{eventToShowDescription?.description}</pre>
        </div>
      </Modal>
    </div>
  );
};
