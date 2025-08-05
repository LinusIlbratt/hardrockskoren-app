// src/pages/member/MemberEventPage.tsx

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
  
  // STEG 1: Hämta även resetUpdateNotifications för att kunna rensa "uppdaterad"-status
  const { notificationData, markNewEventAsRead, resetUpdateNotifications } = useEventNotification(groupName);

  const fetchEvents = useCallback(async () => {
    // ... (oförändrad)
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

  const handleInteraction = (eventId: string) => {
    if (notificationData.newEventIds.includes(eventId)) {
      markNewEventAsRead(eventId);
    }
  };

  // STEG 2: Uppdatera logiken för att hantera både nya och uppdaterade events
  const handleShowDescription = (event: Event, isNew: boolean, isUpdated: boolean) => {
    setEventToShowDescription(event);

    // Om eventet var nytt, markera just det som läst.
    if (isNew) {
      handleInteraction(event.eventId);
    }
    // Om eventet var uppdaterat, nollställ alla "uppdaterad"-notiser.
    // Detta är ett bra UX-flöde eftersom användaren nu agerat på en uppdatering.
    if (isUpdated) {
      resetUpdateNotifications();
    }
  };

  const rehearsals = events.filter(e => e.eventType === 'REHEARSAL');
  const concerts = events.filter(e => e.eventType === 'CONCERT');
  const others = events.filter(e => e.eventType !== 'REHEARSAL' && e.eventType !== 'CONCERT');

  const renderEventItem = (event: Event) => {
    const startDate = new Date(event.eventDate);
    const endDate = event.endDate ? new Date(event.endDate) : startDate;
    const hasEventPassed = isPast(endDate);
    const isNextUpcoming = event.eventId === nextUpcomingEventId;
    
    const isNew = notificationData.newEventIds.includes(event.eventId);
    const isUpdated = notificationData.updatedEventIds.includes(event.eventId);

    const isClickableRow = isNew && !event.description;

    // STEG 3: Byt namn på CSS-klassen till något mer generellt som matchar logiken.
    const hasUnreadDescription = event.description && (isNew || isUpdated);

    return (
      <li 
        key={event.eventId} 
        className={`${styles.eventItem} ${hasEventPassed ? styles.pastEvent : ''} ${isNextUpcoming ? styles.nextUpcomingEvent : ''} ${isNew ? styles.newEvent : ''} ${isUpdated ? styles.updatedEvent : ''} ${isClickableRow ? styles.clickableRow : ''}`}
        onClick={isClickableRow ? () => handleInteraction(event.eventId) : undefined}
      >
        <div className={styles.calendarBlock}>
          <span className={styles.month}>{format(startDate, "MMM", { locale: sv })}</span>
          <span className={styles.day}>{format(startDate, "d")}</span>
        </div>
        <div className={styles.itemDetails}>
          <span className={styles.itemTitle}>{event.title}</span>
          <span className={styles.itemTime}>{`kl. ${format(startDate, 'HH:mm')} – ${format(endDate, 'HH:mm')}`}</span>
        </div>
        <div className={styles.actions}>
          {event.description && (
            <button 
              className={`${styles.iconButton} ${hasUnreadDescription ? styles.unreadDescription : ''}`} 
              onClick={() => handleShowDescription(event, isNew, isUpdated)} 
              title="Visa beskrivning"
            >
              <IoEyeOutline size={32} />
            </button>
          )}
        </div>
      </li>
    );
  };
  
  // ... (resten av komponenten är oförändrad) ...
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
          <button className={`${styles.tabButton} ${activeTab === 'REHEARSAL' ? styles.activeTab : ''}`} onClick={() => setActiveTab('REHEARSAL')}>Repetitioner</button>
          <button className={`${styles.tabButton} ${activeTab === 'CONCERT' ? styles.activeTab : ''}`} onClick={() => setActiveTab('CONCERT')}>Konserter</button>
          {others.length > 0 && (<button className={`${styles.tabButton} ${activeTab === 'OTHER' ? styles.activeTab : ''}`} onClick={() => setActiveTab('OTHER')}>Övrigt</button>)}
        </div>
      </div>
      <div className={styles.legend}>
        <IoInformationCircleOutline size={20} className={styles.legendIcon} />
        <p className={styles.legendText}>Tryck på ögat-ikonen <IoEyeOutline size={20} className={styles.inlineIcon} /> för att läsa mer information om ett event.</p>
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