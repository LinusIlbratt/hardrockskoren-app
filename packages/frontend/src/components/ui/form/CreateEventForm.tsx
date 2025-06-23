import { useState, useEffect } from 'react';
import * as eventService from '@/services/eventService';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import styles from './CreateEventForm.module.scss'; // Antar att vi återanvänder samma formulärstilar

// --- Typer ---
interface Event {
  eventId: string;
  title: string;
  eventDate: string;
  eventType: 'CONCERT' | 'REHEARSAL';
  description: string | null;
}

interface CreateEventFormProps {
  groupSlug: string;
  authToken: string;
  eventToEdit: Event | null; // Tar emot eventet som ska redigeras, eller null för att skapa nytt
  onSuccess: () => void;     // Callback för att meddela föräldern att vi är klara
  onClose: () => void;       // Callback för att stänga modalen (t.ex. vid "Avbryt")
}

const initialFormState = {
  title: '',
  eventDate: '',
  eventType: 'REHEARSAL' as 'CONCERT' | 'REHEARSAL',
  description: '',
};

export const CreateEventForm = ({ groupSlug, authToken, eventToEdit, onSuccess, onClose }: CreateEventFormProps) => {
  const [formData, setFormData] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // useEffect för att fylla i formuläret när vi går in i "redigera"-läge
  useEffect(() => {
    if (eventToEdit) {
      const localDate = new Date(eventToEdit.eventDate).toISOString().slice(0, 16);
      setFormData({
        title: eventToEdit.title,
        eventDate: localDate,
        eventType: eventToEdit.eventType,
        description: eventToEdit.description || '',
      });
    } else {
      // Nollställ formuläret om vi skapar nytt (eller om modalen stängs och öppnas igen)
      setFormData(initialFormState);
    }
  }, [eventToEdit]); // Denna effekt körs varje gång 'eventToEdit' ändras

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    
    const submissionData = { ...formData, eventDate: new Date(formData.eventDate).toISOString() };

    try {
      if (eventToEdit) {
        // Uppdatera befintligt event
        await eventService.updateEvent(groupSlug, eventToEdit.eventId, submissionData, authToken);
      } else {
        // Skapa nytt event
        await eventService.createEvent(groupSlug, submissionData, authToken);
      }
      onSuccess(); // Meddela föräldern att allt gick bra!
    } catch (err: any) {
      console.error("Failed to save event:", err);
      setError(err.message || "Kunde inte spara event.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <FormGroup label="Titel">
        <Input name="title" type="text" value={formData.title} onChange={handleInputChange} required />
      </FormGroup>
      <FormGroup label="Datum och tid">
        <Input name="eventDate" type="datetime-local" value={formData.eventDate} onChange={handleInputChange} required />
      </FormGroup>
      <FormGroup label="Typ av event">
        <select name="eventType" value={formData.eventType} onChange={handleInputChange} required>
          <option value="REHEARSAL">Rep</option>
          <option value="CONCERT">Konsert</option>
        </select>
      </FormGroup>
      <FormGroup label="Beskrivning (valfri)">
        <textarea name="description" value={formData.description} onChange={handleInputChange} />
      </FormGroup>
      <div className={styles.buttonGroup}>
        <Button type="submit" isLoading={isSubmitting}>
          {eventToEdit ? 'Spara ändringar' : 'Skapa event'}
        </Button>
        <Button type="button" variant={ButtonVariant.Ghost} onClick={onClose}>
          Avbryt
        </Button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
};