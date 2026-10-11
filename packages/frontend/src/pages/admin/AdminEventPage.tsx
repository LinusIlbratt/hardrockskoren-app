import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { format, isPast } from 'date-fns';
import { sv } from 'date-fns/locale';
import * as eventService from '@/services/eventService';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { Tab, Tabs } from '@/components/ui/tabs/Tabs';
import { CreateEventForm, CreateRecurringEventForm } from '@/features/events';
import { Info } from 'lucide-react';
import { FiEdit, FiClock } from 'react-icons/fi';
import { IoTrashOutline, IoEyeOutline } from 'react-icons/io5';
import type { Event } from '@/types';
import styles from './AdminEventPage.module.scss';
import { useAuth } from '@/context/AuthContext';
import { SharedConcertSignupPanel } from '@/features/concerts';

export const AdminEventPage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const { user } = useAuth();

  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'REHEARSAL' | 'CONCERT' | 'SHARED'>('REHEARSAL');
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [eventToShowDescription, setEventToShowDescription] = useState<Event | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const fetchEvents = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token || !groupName) return;
    setIsLoading(true);
    try {
      const data = await eventService.listEvents(groupName, token);
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

  const handleCloseEventModal = () => {
    setIsEventModalOpen(false);
    setEventToEdit(null);
  };

  const handleCloseRecurringModal = () => {
    setIsRecurringModalOpen(false);
  };

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
            <button type="button" className={styles.iconButton} onClick={() => setEventToShowDescription(event)} aria-label="Visa beskrivning" title="Visa beskrivning">
              <IoEyeOutline size={18} aria-hidden />
            </button>
          )}
          <button type="button" className={styles.iconButton} onClick={() => handleOpenEditModal(event)} aria-label="Redigera" title="Redigera">
            <FiEdit size={16} aria-hidden />
          </button>
          <button type="button" className={`${styles.iconButton} ${styles.deleteIcon}`} onClick={() => setEventToDelete(event)} aria-label="Ta bort" title="Ta bort">
            <IoTrashOutline size={18} aria-hidden />
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2>Hantera Events</h2>
          <button
            type="button"
            className={styles.infoButton}
            onClick={() => setIsHelpOpen(true)}
            aria-label="Så fungerar det"
            aria-expanded={isHelpOpen}
          >
            <Info size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {activeTab !== 'SHARED' && (
        <div className={styles.buttonGroup}>
          <Button className={styles.primaryButton} onClick={handleOpenCreateModal}>Skapa enstaka event</Button>
          <Button className={styles.secondaryButton} onClick={() => setIsRecurringModalOpen(true)}>Skapa återkommande</Button>
        </div>
        )}
      </div>

      <Tabs label="Gig och repdatum" className={styles.tabs}>
        <Tab active={activeTab === 'REHEARSAL'} onSelect={() => setActiveTab('REHEARSAL')}>Rep</Tab>
        {(user?.role === 'admin' || user?.role === 'leader') && (
          <Tab active={activeTab === 'CONCERT'} onSelect={() => setActiveTab('CONCERT')}>Gig</Tab>
        )}
        <Tab active={activeTab === 'SHARED'} onSelect={() => setActiveTab('SHARED')}>Gemensamma Gig</Tab>
      </Tabs>

      {activeTab === 'SHARED' ? (
        <SharedConcertSignupPanel
          preferredChoirSlug={groupName}
          userGroups={user?.groups ?? []}
          givenName={user?.given_name}
          familyName={user?.family_name}
        />
      ) : (
      <section className={styles.listSection}>
        {isLoading ? ( <p>Laddar events...</p> ) : (
          <>
            {activeTab === 'REHEARSAL' && (<ul className={styles.eventList}>{rehearsals.length > 0 ? rehearsals.map(renderEventItem) : <p>Inga rep planerade.</p>}</ul>)}
            {activeTab === 'CONCERT' && (<ul className={styles.eventList}>{concerts.length > 0 ? concerts.map(renderEventItem) : <p>Inga gig planerade.</p>}</ul>)}
          </>
        )}
      </section>
      )}

      <Modal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        title="Så fungerar det"
        tone="luxury"
        size="compact"
      >
        <p className={styles.helpText}>
          Tryck på ikonen <IoEyeOutline size={18} aria-hidden="true" /> för att visa, <FiEdit size={18} aria-hidden="true" /> för att redigera eller <IoTrashOutline size={18} aria-hidden="true" /> för att ta bort ett event.
        </p>
      </Modal>

      <Modal
        formMode
        isOpen={isEventModalOpen}
        onClose={handleCloseEventModal}
        title={eventToEdit ? 'Redigera event' : 'Skapa nytt event'}
      >
        <CreateEventForm
          user={user}
          groupSlug={groupName!}
          authToken={localStorage.getItem('authToken')!}
          eventToEdit={eventToEdit}
          onSuccess={() => { handleCloseEventModal(); fetchEvents(); }}
        />
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

      <Modal
        formMode
        isOpen={isRecurringModalOpen}
        onClose={handleCloseRecurringModal}
        title="Skapa återkommande events"
      >
        <CreateRecurringEventForm
          user={user}
          groupSlug={groupName!}
          authToken={localStorage.getItem('authToken')!}
          onSuccess={() => { handleCloseRecurringModal(); fetchEvents(); }}
        />
      </Modal>

      <Modal isOpen={!!eventToShowDescription} onClose={() => setEventToShowDescription(null)} title={eventToShowDescription?.title || "Eventbeskrivning"}>
        <div>
          <pre className={`${styles.descriptionText} whitespace-pre-wrap`}>{eventToShowDescription?.description}</pre>
        </div>
      </Modal>
    </div>
  );
};
