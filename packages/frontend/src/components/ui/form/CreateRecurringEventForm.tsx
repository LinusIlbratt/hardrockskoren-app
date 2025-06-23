import { useState } from 'react';
import * as eventService from '@/services/eventService';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import styles from './CreateRecurringEventForm.module.scss';

interface CreateRecurringEventFormProps {
  groupSlug: string;
  authToken: string;
  onSuccess: () => void;
}

const weekdaysMap = [
  { label: 'Måndag', value: 1 },
  { label: 'Tisdag', value: 2 },
  { label: 'Onsdag', value: 3 },
  { label: 'Torsdag', value: 4 },
  { label: 'Fredag', value: 5 },
  { label: 'Lördag', value: 6 },
  { label: 'Söndag', value: 0 },
];

export const CreateRecurringEventForm = ({ groupSlug, authToken, onSuccess }: CreateRecurringEventFormProps) => {
  const [formData, setFormData] = useState({
    title: 'Repetition',
    eventType: 'REHEARSAL' as 'CONCERT' | 'REHEARSAL',
    description: '',
    startDate: '',
    endDate: '',
    time: '19:00',
    selectedWeekdays: [] as number[],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleWeekdayChange = (dayValue: number) => {
    setFormData(prev => {
      const weekdays = prev.selectedWeekdays;
      if (weekdays.includes(dayValue)) {
        return { ...prev, selectedWeekdays: weekdays.filter(d => d !== dayValue) };
      } else {
        return { ...prev, selectedWeekdays: [...weekdays, dayValue] };
      }
    });
  };

  // ==========================================================
  // FÖRENKLAD handleSubmit-FUNKTION
  // ==========================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validera att minst en veckodag är vald
    if (formData.selectedWeekdays.length === 0) {
      setError("Du måste välja minst en veckodag.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Skapa "receptet" som ska skickas till backend.
      // Inga loopar eller komplex logik behövs här längre.
      const payload = {
        title: formData.title,
        eventType: formData.eventType,
        description: formData.description,
        startDate: formData.startDate,
        endDate: formData.endDate,
        time: formData.time,
        selectedWeekdays: formData.selectedWeekdays,
      };

      // Gör ett ENDA anrop till det nya, effektiva service-endpointet.
      await eventService.batchCreateEvents(groupSlug, payload, authToken);
      
      onSuccess(); // Anropa onSuccess för att stänga modalen och uppdatera listan
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Ett okänt fel uppstod.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <FormGroup label="Titel (för alla events)">
        <Input name="title" type="text" value={formData.title} onChange={handleInputChange} required />
      </FormGroup>
      <div className={styles.row}>
        <FormGroup label="Startdatum">
          <Input name="startDate" type="date" value={formData.startDate} onChange={handleInputChange} required />
        </FormGroup>
        <FormGroup label="Slutdatum">
          <Input name="endDate" type="date" value={formData.endDate} onChange={handleInputChange} required />
        </FormGroup>
      </div>
      <FormGroup label="Tidpunkt (för alla events)">
        <Input name="time" type="time" value={formData.time} onChange={handleInputChange} required />
      </FormGroup>
      <FormGroup label="Upprepa på följande dagar">
        <div className={styles.checkboxGroup}>
          {weekdaysMap.map(day => (
            <label key={day.value} className={styles.checkboxLabel}>
              <input 
                type="checkbox"
                checked={formData.selectedWeekdays.includes(day.value)}
                onChange={() => handleWeekdayChange(day.value)}
              />
              {day.label}
            </label>
          ))}
        </div>
      </FormGroup>
      <FormGroup label="Typ av event">
        <select name="eventType" value={formData.eventType} onChange={handleInputChange} required>
          <option value="REHEARSAL">Rep</option>
          <option value="CONCERT">Konsert</option>
        </select>
      </FormGroup>
      <Button type="submit" isLoading={isSubmitting}>
        Skapa events
      </Button>
      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
};
