import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import * as eventService from '@/services/eventService';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { CreateRecurringEventForm } from '@/components/ui/form/CreateRecurringEventForm';
import { CreateEventForm } from '@/components/ui/form/CreateEventForm'; // Ny import
import styles from './AdminEventPage.module.scss';

// --- Typer ---
interface Event {
  eventId: string;
  title: string;
  eventDate: string;
  eventType: 'CONCERT' | 'REHEARSAL';
  description: string | null;
}

export const AdminEventPage = () => {
  const { groupName } = useParams<{ groupName: string }>();

  // --- State-hantering ---
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // State för modaler
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);

  // --- Logik-funktioner ---
  const fetchEvents = useCallback(async () => {
    const token = localStorage.getItem('authToken');
    if (!token || !groupName) return;

    setIsLoading(true);
    try {
      const data = await eventService.listEvents(groupName, token);
      setEvents(data);
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setIsLoading(false);
    }
  }, [groupName]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // --- Handlers för att öppna modaler ---
  const handleOpenCreateModal = () => {
    setEventToEdit(null); // Se till att vi inte är i redigeringsläge
    setIsEventModalOpen(true);
  };

  const handleOpenEditModal = (event: Event) => {
    setEventToEdit(event); // Sätt vilket event som ska redigeras
    setIsEventModalOpen(true);
  };

  // --- Raderingshantering ---
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
      alert("Kunde inte radera eventet.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={styles.pageLayout}>
      <div className={styles.header}>
        <h2>Hantera Events</h2>
        <div className={styles.buttonGroup}>
          <Button onClick={handleOpenCreateModal}>
            Skapa enstaka event
          </Button>
          <Button variant={ButtonVariant.Ghost} onClick={() => setIsRecurringModalOpen(true)}>
            Skapa återkommande
          </Button>
        </div>
      </div>
      <section className={styles.listSection}>
        <div className={styles.topBar} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className={styles.title}>Befintliga Events</h2>

        </div>
        {isLoading ? (
          <p>Laddar events...</p>
        ) : (
          <div className={styles.eventListWrapper}>
            {/* Samma list-logik som förut... */}
            {(() => {
              const rehearsals = events.filter(e => e.eventType === 'REHEARSAL');
              const concerts = events.filter(e => e.eventType === 'CONCERT');
              return (
                <>
                  {rehearsals.length > 0 && (
                    <div className={styles.listGroup}>
                      <h3 className={styles.listHeader}>REPETITIONER</h3>
                      {rehearsals.map(event => (
                        <div key={event.eventId} className={styles.eventItem}>
                          <div className={styles.itemDetails}><span className={styles.itemTitle}>{event.title}</span><span className={styles.itemDate}>{new Date(event.eventDate).toLocaleString('sv-SE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span></div>
                          <div className={styles.buttonGroup}><Button variant={ButtonVariant.Ghost} onClick={() => handleOpenEditModal(event)}>Redigera</Button><Button variant={ButtonVariant.Destructive} onClick={() => setEventToDelete(event)}>Radera</Button></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {concerts.length > 0 && (
                    <div className={styles.listGroup}>
                      <h3 className={styles.listHeader}>KONSERTER</h3>
                      {concerts.map(event => (
                        <div key={event.eventId} className={styles.eventItem}>
                          <div className={styles.itemDetails}><span className={styles.itemTitle}>{event.title}</span><span className={styles.itemDate}>{new Date(event.eventDate).toLocaleString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                          <div className={styles.buttonGroup}><Button variant={ButtonVariant.Ghost} onClick={() => handleOpenEditModal(event)}>Redigera</Button><Button variant={ButtonVariant.Destructive} onClick={() => setEventToDelete(event)}>Radera</Button></div>
                        </div>
                      ))}
                    </div>
                  )}
                  {events.length === 0 && <p>Inga events har skapats för denna grupp ännu.</p>}
                </>
              );
            })()}
          </div>
        )}
      </section>

      {/* --- Modaler --- */}

      {/* Modal för att skapa/redigera enstaka event */}
      <Modal isOpen={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} title={eventToEdit ? 'Redigera event' : 'Skapa nytt event'}>
        <CreateEventForm
          groupSlug={groupName!}
          authToken={localStorage.getItem('authToken')!}
          eventToEdit={eventToEdit}
          onClose={() => setIsEventModalOpen(false)}
          onSuccess={() => {
            setIsEventModalOpen(false);
            fetchEvents();
          }}
        />
      </Modal>

      {/* Modal för att bekräfta radering */}
      <Modal isOpen={!!eventToDelete} onClose={() => setEventToDelete(null)} title="Bekräfta radering">
        <div>
          <p>Är du säker på att du vill radera eventet "{eventToDelete?.title}"?</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <Button variant={ButtonVariant.Ghost} onClick={() => setEventToDelete(null)}>Avbryt</Button>
            <Button variant={ButtonVariant.Destructive} isLoading={isDeleting} onClick={handleConfirmDelete}>Ja, radera</Button>
          </div>
        </div>
      </Modal>

      {/* Modal för att skapa återkommande events */}
      <Modal isOpen={isRecurringModalOpen} onClose={() => setIsRecurringModalOpen(false)} title="Skapa återkommande events">
        <CreateRecurringEventForm
          groupSlug={groupName!}
          authToken={localStorage.getItem('authToken')!}
          onSuccess={() => {
            setIsRecurringModalOpen(false);
            fetchEvents();
          }}
        />
      </Modal>
    </div>
  );
};