import { useState } from 'react';

// Importer för våra anpassade komponenter
import { StyledSelect, type SelectOption } from '@/components/ui/select/StyledSelect';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';

// Importer för datumväljaren
import DatePicker, { registerLocale } from "react-datepicker";
import { sv } from 'date-fns/locale';
import { format } from 'date-fns';
registerLocale('sv', sv);

// Övriga importer
import * as eventService from '@/services/eventService';
import styles from './CreateRecurringEventForm.module.scss';

// --- Data-arrayer för våra select-komponenter ---
const eventTypeOptions: SelectOption[] = [
  { value: 'REHEARSAL', label: 'Repetition' },
  { value: 'CONCERT', label: 'Konsert' },
];

const repetitionIntervalOptions: SelectOption[] = [
  { value: 1, label: 'Varje vecka' },
  { value: 2, label: 'Var annan vecka' },
  { value: 3, label: 'Var tredje vecka' },
  { value: 4, label: 'Var fjärde vecka' },
];

const weekdaysMap = [
  { label: 'Måndag', value: 1 },
  { label: 'Tisdag', value: 2 },
  { label: 'Onsdag', value: 3 },
  { label: 'Torsdag', value: 4 },
  { label: 'Fredag', value: 5 },
  { label: 'Lördag', value: 6 },
  { label: 'Söndag', value: 0 },
];

interface CreateRecurringEventFormProps {
  groupSlug: string;
  authToken: string;
  onSuccess: () => void;
}

export const CreateRecurringEventForm = ({ groupSlug, authToken, onSuccess }: CreateRecurringEventFormProps) => {
  const [formData, setFormData] = useState({
    title: '',
    eventType: 'REHEARSAL' as 'CONCERT' | 'REHEARSAL',
    description: '',
    startDate: '',
    endDate: '',
    time: '19:00',
    selectedWeekdays: [] as number[],
    repetitionInterval: 1,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Hanterare ---

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEventTypeChange = (selectedOption: SelectOption | null) => {
    if (selectedOption) {
      setFormData(prev => ({ ...prev, eventType: selectedOption.value as 'REHEARSAL' | 'CONCERT' }));
    }
  };

  const handleRepetitionIntervalChange = (selectedOption: SelectOption | null) => {
    if (selectedOption) {
      setFormData(prev => ({ ...prev, repetitionInterval: selectedOption.value as number }));
    }
  };

  const handleStartDateChange = (date: Date | null) => {
    if (date) {
      setFormData(prev => ({ ...prev, startDate: format(date, 'yyyy-MM-dd') }));
    }
  };

  const handleEndDateChange = (date: Date | null) => {
    if (date) {
      setFormData(prev => ({ ...prev, endDate: format(date, 'yyyy-MM-dd') }));
    }
  };

  const handleWeekdayChange = (dayValue: number) => {
    setFormData(prev => {
      const weekdays = prev.selectedWeekdays;
      return weekdays.includes(dayValue)
        ? { ...prev, selectedWeekdays: weekdays.filter(d => d !== dayValue) }
        : { ...prev, selectedWeekdays: [...weekdays, dayValue] };
    });
  };

  const handleTimeChange = (date: Date | null) => {
    if (date) {
      // Formatera Date-objektet till en 'HH:mm'-sträng och spara i state
      setFormData(prev => ({ ...prev, time: format(date, 'HH:mm') }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.selectedWeekdays.length === 0) {
      setError("Du måste välja minst en veckodag.");
      return;
    }

    setIsSubmitting(true);
    try {
      await eventService.batchCreateEvents(groupSlug, { ...formData }, authToken);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Ett okänt fel uppstod.');
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
          <DatePicker
            selected={formData.startDate ? new Date(formData.startDate) : null}
            onChange={handleStartDateChange}
            dateFormat="yyyy-MM-dd"
            className={styles.input}
            locale="sv"
            required
            selectsStart
            startDate={formData.startDate ? new Date(formData.startDate) : null}
            endDate={formData.endDate ? new Date(formData.endDate) : null}
            placeholderText="Välj startdatum..."
          />
        </FormGroup>
        <FormGroup label="Slutdatum">
          <DatePicker
            selected={formData.endDate ? new Date(formData.endDate) : null}
            onChange={handleEndDateChange}
            dateFormat="yyyy-MM-dd"
            className={styles.input}
            locale="sv"
            required
            selectsEnd
            startDate={formData.startDate ? new Date(formData.startDate) : null}
            endDate={formData.endDate ? new Date(formData.endDate) : null}
            minDate={formData.startDate ? new Date(formData.startDate) : undefined}
            placeholderText="Välj slutdatum..."
          />
        </FormGroup>
      </div>

      <FormGroup label="Tidpunkt (för alla events)">
        <DatePicker
          // 'selected' måste vara ett Date-objekt. Vi skapar ett temporärt
          // Date-objekt från tids-strängen i vårt state.
          selected={(() => {
            const tempDate = new Date();
            const [hours, minutes] = formData.time.split(':');
            tempDate.setHours(parseInt(hours, 10), parseInt(minutes, 10));
            return tempDate;
          })()}
          onChange={handleTimeChange}

          // Dessa två props är nyckeln för att BARA visa tid
          showTimeSelect
          showTimeSelectOnly

          // Konfiguration för hur tidslistan ser ut
          timeIntervals={15}
          timeCaption="Tid"

          // Formatet som visas i själva input-fältet
          dateFormat="HH:mm"

          // Återanvänd din befintliga styling och andra props
          className={styles.input}
          locale="sv"
          required
        />
      </FormGroup>

      <FormGroup label="Repetera">
        <div className={styles.repetitionControls}>
          <StyledSelect
            name="repetitionInterval"
            className={styles.repetitionSelect}
            options={repetitionIntervalOptions}
            value={repetitionIntervalOptions.find(option => option.value === formData.repetitionInterval)}
            onChange={(option) => handleRepetitionIntervalChange(option as SelectOption)}
          />
        </div>
        <div className={styles.checkboxGroup}>
          {weekdaysMap.map(day => (
            <label key={day.value} className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={formData.selectedWeekdays.includes(day.value)}
                onChange={() => handleWeekdayChange(day.value)}
              />
              <span>{day.label}</span>
            </label>
          ))}
        </div>
      </FormGroup>

      <FormGroup label="Typ av event">
        <StyledSelect
          name="eventType"
          options={eventTypeOptions}
          value={eventTypeOptions.find(option => option.value === formData.eventType)}
          onChange={(option) => handleEventTypeChange(option as SelectOption)}
          placeholder="Välj typ..."
        />
      </FormGroup>

      <Button type="submit" isLoading={isSubmitting}>
        Skapa events
      </Button>

      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
};