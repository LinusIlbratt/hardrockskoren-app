import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import styles from './MemberEventPage.module.scss';
import type { Event } from '@/types';

const API_BASE_URL = import.meta.env.VITE_EVENT_API_URL;

export const MemberEventPage = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  // --- KORRIGERING 1: Gruppera på 'eventType' istället för 'type' ---
  const groupedEvents = events.reduce((acc, event) => {
    const typeKey = event.eventType || 'Övrigt';
    if (!acc[typeKey]) {
      acc[typeKey] = [];
    }
    acc[typeKey].push(event);
    return acc;
  }, {} as Record<string, Event[]>);

  const formatSimpleDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };

  if (isLoading) return <p>Laddar kommande händelser...</p>;
  if (error) return <p className={styles.error}>{error}</p>;

  return (
    <div className={styles.container}>
      {events.length > 0 ? (
        <div className={styles.eventsContainer}>
          <h2 className={styles.mainTitle}>EVENT</h2>

          {/* --- KORRIGERING 2: Leta efter 'REHEARSAL' som nyckel --- */}
          {groupedEvents['REHEARSAL'] && (
            <section className={styles.eventSection}>
              <h3 className={styles.sectionTitle}>Repetitioner</h3>
              <ul className={styles.eventList}>
                {groupedEvents['REHEARSAL'].map(event => (
                  <li key={event.eventId} className={styles.eventItem}>
                    <span>{formatSimpleDate(event.eventDate)}</span>
                    <span>{event.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* --- KORRIGERING 3: Leta efter 'CONCERT' som nyckel --- */}
          {groupedEvents['CONCERT'] && (
            <section className={styles.eventSection}>
              <h3 className={styles.sectionTitle}>Konserter</h3>
              <ul className={styles.eventList}>
                {groupedEvents['CONCERT'].map(event => (
                  <li key={event.eventId} className={styles.eventItem}>
                    <span>{formatSimpleDate(event.eventDate)}</span>
                    <span>{event.title}</span>
                    {event.location && <span>{event.location}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          
          {groupedEvents['Övrigt'] && (
            <section className={styles.eventSection}>
              <h3 className={styles.sectionTitle}>Övrigt</h3>
              <ul className={styles.eventList}>
                {groupedEvents['Övrigt'].map(event => (
                  <li key={event.eventId} className={styles.eventItem}>
                    <span>{formatSimpleDate(event.eventDate)}</span>
                    <span>{event.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

        </div>
      ) : (
        <p>Det finns inga inplanerade händelser för tillfället.</p>
      )}
    </div>
  );
};