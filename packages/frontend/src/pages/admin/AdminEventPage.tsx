import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as eventService from '@/services/eventService';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { CreateRecurringEventForm } from '@/components/ui/form/CreateRecurringEventForm';
import { CreateEventForm } from '@/components/ui/form/CreateEventForm';
import { FiEdit } from 'react-icons/fi';
import { IoTrashOutline, IoEyeOutline } from 'react-icons/io5';
import type { Event } from '@/types';
import styles from './AdminEventPage.module.scss';

export const AdminEventPage = () => {
  const { groupName } = useParams<{ groupName: string }>();

  // --- State-hantering ---
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // State för att hålla koll på aktiv flik
  const [activeTab, setActiveTab] = useState<'REHEARSAL' | 'CONCERT' | 'OTHER'>('REHEARSAL');

  // State för modaler (oförändrat)
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [eventToShowDescription, setEventToShowDescription] = useState<Event | null>(null);

  // --- Logik-funktioner ---
  const fetchEvents = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token || !groupName) return;
    setIsLoading(true);
    try {
      const data = await eventService.listEvents(groupName, token);
      const sortedData = data.sort((b, a) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
      setEvents(sortedData);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setIsLoading(false);
    }
  }, [groupName]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const handleOpenCreateModal = () => { setEventToEdit(null); setIsEventModalOpen(true); };
  const handleOpenEditModal = (event: Event) => { setEventToEdit(event); setIsEventModalOpen(true); };
  
  // KORRIGERAD: Den fullständiga logiken för radering är nu tillbaka
  const handleConfirmDelete = async () => {
    const token = localStorage.getItem('authToken');
    if (!token || !groupName || !eventToDelete) return;

    setIsDeleting(true); // Används för att visa laddningsspinner
    try {
      await eventService.deleteEvent(groupName, eventToDelete.eventId, token);
      setEventToDelete(null);
      fetchEvents(); // Ladda om listan efter radering
    } catch (error) {
      console.error("Failed to delete event:", error);
      alert("Kunde inte radera eventet."); // Eller en snyggare notifiering
    } finally {
      setIsDeleting(false); // Stänger av laddningsspinnern
    }
  };

  // --- Renderingslogik ---
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
        <button className={styles.iconButton} onClick={() => handleOpenEditModal(event)} title="Redigera">
          <FiEdit size={18} />
        </button>
        <button className={`${styles.iconButton} ${styles.deleteIcon}`} onClick={() => setEventToDelete(event)} title="Radera">
          <IoTrashOutline size={20} />
        </button>
      </div>
    </li>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Hantera Events</h2>
        <div className={styles.buttonGroup}>
          <Button onClick={handleOpenCreateModal}>Skapa enstaka event</Button>
          <Button onClick={() => setIsRecurringModalOpen(true)}>Skapa återkommande</Button>
        </div>
      </div>

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
      
      <section className={styles.listSection}>
        {isLoading ? (
          <p>Laddar events...</p>
        ) : events.length > 0 ? (
          <>
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
          </>
        ) : (
          <p>Inga events har skapats för denna grupp ännu.</p>
        )}
      </section>

      {/* --- Modaler --- */}
      <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title={eventToEdit ? 'Redigera event' : 'Skapa nytt event'}>
        <CreateEventForm
          groupSlug={groupName!}
          authToken={localStorage.getItem('authToken')!}
          eventToEdit={eventToEdit}
          onClose={() => setIsEventModalOpen(false)}
          onSuccess={() => { setIsEventModalOpen(false); fetchEvents(); }}
        />
      </Modal>
      <Modal isOpen={!!eventToDelete} onClose={() => setEventToDelete(null)} title="Bekräfta radering">
        <div>
          <p>Är du säker på att du vill radera eventet "{eventToDelete?.title}"?</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <Button variant={ButtonVariant.Ghost} onClick={() => setEventToDelete(null)}>Avbryt</Button>
            <Button variant={ButtonVariant.Destructive} isLoading={isDeleting} onClick={handleConfirmDelete}>Ja, radera</Button>
          </div>
        </div>
      </Modal>
      <Modal isOpen={isRecurringModalOpen} onClose={() => setIsRecurringModalOpen(false)} title="Skapa återkommande events">
        <CreateRecurringEventForm
          groupSlug={groupName!}
          authToken={localStorage.getItem('authToken')!}
          onSuccess={() => { setIsRecurringModalOpen(false); fetchEvents(); }}
        />
      </Modal>
      <Modal isOpen={!!eventToShowDescription} onClose={() => setEventToShowDescription(null)} title={eventToShowDescription?.title || "Eventbeskrivning"}>
        <div>
          <pre className={styles.descriptionText}>
            {eventToShowDescription?.description}
          </pre>
        </div>
      </Modal>
    </div>
  );
};
