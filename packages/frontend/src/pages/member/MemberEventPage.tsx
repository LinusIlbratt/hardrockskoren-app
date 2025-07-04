// src/pages/member/MemberEventPage.tsx

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Modal } from '@/components/ui/modal/Modal';
import { IoEyeOutline } from 'react-icons/io5';
import styles from './MemberEventPage.module.scss';
import type { Event } from '@/types';

const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;

export const MemberEventPage = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventToShowDescription, setEventToShowDescription] = useState<Event | null>(null);
  
  // NYTT: State för att hålla koll på aktiv flik. 'REHEARSAL' är standard.
  const [activeTab, setActiveTab] = useState<'REHEARSAL' | 'CONCERT' | 'OTHER'>('REHEARSAL');
  
  const { user } = useAuth();

  const fetchEvents = useCallback(async () => {
    const userGroup = user?.groups?.[0];
    if (!userGroup) { setIsLoading(false); setError("Kunde inte identifiera din grupp."); return; }
    setIsLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    try {
      const url = `${API_BASE_URL}/groups/${userGroup}/events`;
      const response = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      const sortedEvents = response.data.sort((a: Event, b: Event) => 
        new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
      );
      setEvents(sortedEvents);
    } catch (err) {
      setError("Kunde inte hämta event.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchEvents();
  }, [user, fetchEvents]);

  if (isLoading) return <p>Laddar kommande händelser...</p>;
  if (error) return <p className={styles.error}>{error}</p>;

  const rehearsals = events.filter(e => e.eventType === 'REHEARSAL');
  const concerts = events.filter(e => e.eventType === 'CONCERT');
  const others = events.filter(e => e.eventType !== 'REHEARSAL' && e.eventType !== 'CONCERT');

  const renderEventItem = (event: Event) => (
    <li key={event.eventId} className={styles.eventItem}>
      <div className={styles.itemDetails}>
        <span className={styles.itemTitle}>{event.title}</span>
        <span className={styles.itemDate}>{new Date(event.eventDate).toLocaleString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className={styles.actions}>
        {event.description && (
          <button className={styles.iconButton} onClick={() => setEventToShowDescription(event)} title="Visa beskrivning">
            <IoEyeOutline size={22} />
          </button>
        )}
      </div>
    </li>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Mina Events</h2>
        
        {/* NYTT: Flik-navigering */}
        <div className={styles.tabs}>
          <button 
            className={`${styles.tabButton} ${activeTab === 'REHEARSAL' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('REHEARSAL')}
          >
            Repetitioner
          </button>
          <button 
            className={`${styles.tabButton} ${activeTab === 'CONCERT' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('CONCERT')}
          >
            Konserter
          </button>
          {others.length > 0 && (
            <button 
              className={`${styles.tabButton} ${activeTab === 'OTHER' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('OTHER')}
            >
              Övrigt
            </button>
          )}
        </div>
      </div>

      {events.length > 0 ? (
        <section className={styles.listSection}>
          {/* NYTT: Villkorlig rendering av listan baserat på aktiv flik */}
          {activeTab === 'REHEARSAL' && (
            <ul className={styles.eventList}>
              {rehearsals.map(renderEventItem)}
            </ul>
          )}
          {activeTab === 'CONCERT' && (
            <ul className={styles.eventList}>
              {concerts.map(renderEventItem)}
            </ul>
          )}
          {activeTab === 'OTHER' && (
            <ul className={styles.eventList}>
              {others.map(renderEventItem)}
            </ul>
          )}
        </section>
      ) : (
        <p>Det finns inga inplanerade händelser för tillfället.</p>
      )}

      {/* Modal för att visa beskrivning (oförändrad) */}
      <Modal 
        isOpen={!!eventToShowDescription} 
        onClose={() => setEventToShowDescription(null)}
        title={eventToShowDescription?.title || "Eventbeskrivning"}
      >
        <div>
          <pre className={styles.descriptionText}>
            {eventToShowDescription?.description}
          </pre>
        </div>
      </Modal>
    </div>
  );
};
