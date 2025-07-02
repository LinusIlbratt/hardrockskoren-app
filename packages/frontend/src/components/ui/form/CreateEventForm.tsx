import { useState, useEffect } from 'react';

// Importera vår nya, stylade komponent och den delade option-typen
import { StyledSelect, type SelectOption } from '@/components/ui/select/StyledSelect';

// Importer för datumväljaren
import DatePicker, { registerLocale } from "react-datepicker"; 
import { sv } from 'date-fns/locale'; 
import { format } from 'date-fns';
registerLocale('sv', sv); 

// Dina nödvändiga importer som ska vara kvar
import * as eventService from '@/services/eventService';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import styles from './CreateEventForm.module.scss';
import type { Event } from '@/types';

// Datan för just detta formulär
const eventTypeOptions: SelectOption[] = [
  { value: 'REHEARSAL', label: 'Repetition' },
  { value: 'CONCERT', label: 'Konsert' },
];

interface CreateEventFormProps {
  groupSlug: string;
  authToken: string;
  eventToEdit: Event | null;
  onSuccess: () => void;
  onClose: () => void;
}

const initialFormState = {
  title: '',
  eventDate: '',
  eventType: 'REHEARSAL' as 'REHEARSAL' | 'CONCERT',
  description: '',
};

export const CreateEventForm = ({ groupSlug, authToken, eventToEdit, onSuccess, onClose }: CreateEventFormProps) => {
  const [formData, setFormData] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (eventToEdit) {
      const eventDate = new Date(eventToEdit.eventDate);
      const localDateString = format(eventDate, "yyyy-MM-dd'T'HH:mm");
      setFormData({
        title: eventToEdit.title,
        eventDate: localDateString,
        eventType: eventToEdit.eventType as 'REHEARSAL' | 'CONCERT',
        description: eventToEdit.description || '',
      });
    } else {
      setFormData(initialFormState);
    }
  }, [eventToEdit]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (selectedOption: SelectOption | null) => {
    if (selectedOption) {
      setFormData(prev => ({ ...prev, eventType: selectedOption.value as 'REHEARSAL' | 'CONCERT' }));
    }
  };

  const handleDateChange = (date: Date | null) => {
    if (date) {
      const localDateString = format(date, "yyyy-MM-dd'T'HH:mm");
      setFormData(prev => ({ ...prev, eventDate: localDateString }));
    } else {
      setFormData(prev => ({...prev, eventDate: ''}));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    
    const submissionData = { ...formData, eventDate: new Date(formData.eventDate).toISOString() };

    try {
      if (eventToEdit) {
        await eventService.updateEvent(groupSlug, eventToEdit.eventId, submissionData, authToken);
      } else {
        await eventService.createEvent(groupSlug, submissionData, authToken);
      }
      onSuccess();
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
        <Input name="title" type="text" value={formData.title} onChange={handleInputChange} required className={styles.input} />
      </FormGroup>

      <FormGroup label="Datum och tid">
        <DatePicker
          selected={formData.eventDate ? new Date(formData.eventDate) : null}
          onChange={handleDateChange}
          showTimeSelect
          timeFormat="HH:mm"
          timeIntervals={15}
          timeCaption="Tid"
          dateFormat="yyyy-MM-dd HH:mm"
          className={styles.input}
          locale="sv"
          required
        />
      </FormGroup>

      <FormGroup label="Typ av event">
        <StyledSelect
          name="eventType"
          options={eventTypeOptions}
          value={eventTypeOptions.find(option => option.value === formData.eventType)}
          onChange={(option) => handleSelectChange(option as SelectOption)}
          placeholder="Välj typ..."
        />
      </FormGroup>

      <FormGroup label="Beskrivning (valfri)">
        <textarea name="description" value={formData.description} onChange={handleInputChange} className={styles.textarea} />
      </FormGroup>

      <div className={styles.buttonGroup}>
        <Button type="button" variant={ButtonVariant.Ghost} onClick={onClose}>
          Avbryt
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {eventToEdit ? 'Spara ändringar' : 'Skapa event'}
        </Button>
      </div>

      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
};