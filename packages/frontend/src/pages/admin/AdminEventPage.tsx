import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { format, isPast } from 'date-fns';
import { sv } from 'date-fns/locale';
import * as eventService from '@/services/eventService';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { CreateRecurringEventForm } from '@/components/ui/form/CreateRecurringEventForm';
import { CreateEventForm } from '@/components/ui/form/CreateEventForm';
import { FiEdit, FiClock } from 'react-icons/fi';
import { IoTrashOutline, IoEyeOutline, IoInformationCircleOutline } from 'react-icons/io5';
import type { Event } from '@/types';
import styles from './AdminEventPage.module.scss';
import { useAuth } from '@/context/AuthContext';

// Notifikations-hooks är nu borttagna eftersom de inte behövs för admins/leaders

export const AdminEventPage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const { user } = useAuth();

  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'REHEARSAL' | 'CONCERT' | 'OTHER'>('REHEARSAL');
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [eventToShowDescription, setEventToShowDescription] = useState<Event | null>(null);

  const fetchEvents = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token || !groupName) return;
    setIsLoading(true);
    try {
      const data = await eventService.listEvents(groupName, token);
      // Notera: Ändrade sorteringen till fallande (nyast först) vilket ofta är mer logiskt i en admin-vy
      const sortedData = data.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
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

  const handleConfirmDelete = async () => {
    const token = localStorage.getItem('authToken');
    if (!token || !groupName || !eventToDelete) return;
    setIsDeleting(true);
    try {
      await eventService.deleteEvent(groupName, eventToDelete.eventId, token);
      setEventToDelete(null);
      fetchEvents();
    } catch (error) {
      console.error("Failed to delete event:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const rehearsals = events.filter(e => e.eventType === 'REHEARSAL');
  const concerts = events.filter(e => e.eventType === 'CONCERT');
  const others = events.filter(e => e.eventType !== 'REHEARSAL' && e.eventType !== 'CONCERT');

  const renderEventItem = (event: Event) => {
    const startDate = new Date(event.eventDate);
    const endDate = event.endDate ? new Date(event.endDate) : startDate;

    const month = format(startDate, "MMM", { locale: sv });
    const day = format(startDate, "d");
    const timeString = `${format(startDate, 'HH:mm')} – ${format(endDate, 'HH:mm')}`;
    const hasEventPassed = isPast(endDate);

    return (
      <li key={event.eventId} className={`${styles.eventItem} ${hasEventPassed ? styles.pastEvent : ''}`}>
        <div className={styles.calendarBlock}>
          <span className={styles.month}>{month}</span>
          <span className={styles.day}>{day}</span>
        </div>
        <div className={styles.itemDetails}>
          <span className={styles.itemTitle}>{event.title}</span>
          <div className={styles.itemTime}>
            <FiClock size={14} />
            <span>{timeString}</span>
          </div>
        </div>
        <div className={styles.actions}>
          {event.description && (
            <button className={styles.iconButton} onClick={() => setEventToShowDescription(event)} title="Visa beskrivning">
              <IoEyeOutline size={22} />
            </button>
          )}
          <div className={styles.editActions}>
            <button className={styles.iconButton} onClick={() => handleOpenEditModal(event)} title="Redigera">
              <FiEdit size={18} />
            </button>
            <button className={`${styles.iconButton} ${styles.deleteIcon}`} onClick={() => setEventToDelete(event)} title="Radera">
              <IoTrashOutline size={20} />
            </button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Hantera Events</h2>
        <div className={styles.buttonGroup}>
          <Button onClick={handleOpenCreateModal}>Skapa enstaka event</Button>
          <Button onClick={() => setIsRecurringModalOpen(true)}>Skapa återkommande</Button>
        </div>
      </div>

      <div className={styles.legend}>
        <IoInformationCircleOutline size={20} className={styles.legendIcon} />
        <p className={styles.legendText}>
          Tryck på<IoEyeOutline size={20} className={styles.inlineIcon} />
           för att se information, 
          <FiEdit size={20} className={styles.inlineIcon} />
           för att redigera, 
          <IoTrashOutline size={20} className={styles.inlineIcon} />
           ta bort ett event.
        </p>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tabButton} ${activeTab === 'REHEARSAL' ? styles.activeTab : ''}`} onClick={() => setActiveTab('REHEARSAL')}>Repetitioner</button>
        {(user?.role === 'admin' || user?.role === 'leader') && (<button className={`${styles.tabButton} ${activeTab === 'CONCERT' ? styles.activeTab : ''}`} onClick={() => setActiveTab('CONCERT')}>Konserter</button>)}
        {others.length > 0 && (<button className={`${styles.tabButton} ${activeTab === 'OTHER' ? styles.activeTab : ''}`} onClick={() => setActiveTab('OTHER')}>Övrigt</button>)}
      </div>

      <section className={styles.listSection}>
        {isLoading ? ( <p>Laddar events...</p> ) : (
          <>
            {activeTab === 'REHEARSAL' && (<ul className={styles.eventList}>{rehearsals.length > 0 ? rehearsals.map(renderEventItem) : <p>Inga repetitioner planerade.</p>}</ul>)}
            {activeTab === 'CONCERT' && (<ul className={styles.eventList}>{concerts.length > 0 ? concerts.map(renderEventItem) : <p>Inga konserter planerade.</p>}</ul>)}
            {activeTab === 'OTHER' && (<ul className={styles.eventList}>{others.length > 0 ? others.map(renderEventItem) : <p>Inga övriga events planerade.</p>}</ul>)}
          </>
        )}
      </section>

      {/* --- Modaler --- */}
      <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title={eventToEdit ? 'Redigera event' : 'Skapa nytt event'}>
        <CreateEventForm user={user} groupSlug={groupName!} authToken={localStorage.getItem('authToken')!} eventToEdit={eventToEdit} onClose={() => setIsEventModalOpen(false)} onSuccess={() => { setIsEventModalOpen(false); fetchEvents(); }} />
      </Modal>
      <Modal isOpen={!!eventToDelete} onClose={() => setEventToDelete(null)} title="Bekräfta radering">
        <div>
          <p>Är du säker på att du vill radera eventet "{eventToDelete?.title}"?</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <Button variant={ButtonVariant.Ghost} onClick={() => setEventToDelete(null)}>Avbryt</Button>
            <Button variant={ButtonVariant.Primary} isLoading={isDeleting} onClick={handleConfirmDelete}>Ja, radera</Button>
          </div>
        </div>
      </Modal>
      <Modal isOpen={isRecurringModalOpen} onClose={() => setIsRecurringModalOpen(false)} title="Skapa återkommande events">
        <CreateRecurringEventForm user={user} groupSlug={groupName!} authToken={localStorage.getItem('authToken')!} onSuccess={() => { setIsRecurringModalOpen(false); fetchEvents(); }} />
      </Modal>
      <Modal isOpen={!!eventToShowDescription} onClose={() => setEventToShowDescription(null)} title={eventToShowDescription?.title || "Eventbeskrivning"}>
        <div>
          <pre className={styles.descriptionText}>{eventToShowDescription?.description}</pre>
        </div>
      </Modal>
    </div>
  );
};