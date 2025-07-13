import React, { useState, useMemo, forwardRef } from 'react';
import { StyledSelect, type SelectOption } from '@/components/ui/select/StyledSelect';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import DatePicker, { registerLocale } from "react-datepicker";
import { sv } from 'date-fns/locale';
import { format, parse } from 'date-fns';
registerLocale('sv', sv);
import * as eventService from '@/services/eventService';
import styles from './CreateRecurringEventForm.module.scss';
import { useAuth } from '@/context/AuthContext';

const CustomDateInput = forwardRef<HTMLButtonElement, { value?: string; onClick?: () => void; className?: string; placeholder?: string }>(
  ({ value, onClick, className, placeholder }, ref) => (
    <button type="button" className={className} onClick={onClick} ref={ref}>{value || placeholder}</button>
  )
);
CustomDateInput.displayName = 'CustomDateInput';

const repetitionIntervalOptions: SelectOption[] = [
  { value: 1, label: 'Varje vecka' }, { value: 2, label: 'Var annan vecka' },
  { value: 3, label: 'Var tredje vecka' }, { value: 4, label: 'Var fjärde vecka' },
];

const weekdaysMap = [
  { label: 'Måndag', value: 1 }, { label: 'Tisdag', value: 2 }, { label: 'Onsdag', value: 3 },
  { label: 'Torsdag', value: 4 }, { label: 'Fredag', value: 5 }, { label: 'Lördag', value: 6 }, { label: 'Söndag', value: 0 },
];

interface CreateRecurringEventFormProps {
  user: ReturnType<typeof useAuth>['user'];
  groupSlug: string;
  authToken: string;
  onSuccess: () => void;
}

export const CreateRecurringEventForm = ({ user, groupSlug, authToken, onSuccess }: CreateRecurringEventFormProps) => {
  const [formData, setFormData] = useState({
    title: '',
    eventType: 'REHEARSAL' as 'CONCERT' | 'REHEARSAL',
    description: '',
    startDate: '',
    endDate: '',
    startTime: '19:00',
    endTime: '21:00',
    selectedWeekdays: [] as number[],
    repetitionInterval: 1,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventTypeOptions = useMemo((): SelectOption[] => {
    const options: SelectOption[] = [{ value: 'REHEARSAL', label: 'Repetition' }];
    if (user?.role === 'admin') {
      options.push({ value: 'CONCERT', label: 'Konsert' });
    }
    return options;
  }, [user]);

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

  const handleTimeChange = (field: 'startTime' | 'endTime', date: Date | null) => {
    if (date) {
      setFormData(prev => ({ ...prev, [field]: format(date, 'HH:mm') }));
    }
  };

  const timeStringToDate = (timeString: string) => {
    if (!timeString) return null;
    return parse(timeString, 'HH:mm', new Date());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.selectedWeekdays.length === 0) {
      setError("Du måste välja minst en veckodag.");
      return;
    }
    
    if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
      setError("Sluttiden måste vara efter starttiden.");
      return;
    }

    setIsSubmitting(true);
    try {
      // ✅ ÄNDRING: Vi skickar nu `formData` direkt, eftersom dess format
      // matchar vad din nya backend-funktion förväntar sig.
      await eventService.batchCreateEvents(groupSlug, formData, authToken);
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
            locale="sv"
            required selectsStart
            startDate={formData.startDate ? new Date(formData.startDate) : null}
            endDate={formData.endDate ? new Date(formData.endDate) : null}
            withPortal
            customInput={<CustomDateInput className={styles.input} placeholder="Välj startdatum..." />}
          />
        </FormGroup>
        <FormGroup label="Slutdatum">
          <DatePicker
            selected={formData.endDate ? new Date(formData.endDate) : null}
            onChange={handleEndDateChange}
            dateFormat="yyyy-MM-dd"
            locale="sv"
            required selectsEnd
            startDate={formData.startDate ? new Date(formData.startDate) : null}
            endDate={formData.endDate ? new Date(formData.endDate) : null}
            minDate={formData.startDate ? new Date(formData.startDate) : undefined}
            withPortal
            customInput={<CustomDateInput className={styles.input} placeholder="Välj slutdatum..." />}
          />
        </FormGroup>
      </div>
      
      <div className={styles.row}>
        <FormGroup label="Starttid">
          <DatePicker
            selected={timeStringToDate(formData.startTime)}
            onChange={(date) => handleTimeChange('startTime', date)}
            showTimeSelect
            showTimeSelectOnly
            timeIntervals={15}
            timeCaption=""
            dateFormat="HH:mm"
            locale="sv"
            required
            withPortal
            customInput={<CustomDateInput className={styles.input} placeholder="Välj tid..." />}
          />
        </FormGroup>
        <FormGroup label="Sluttid">
          <DatePicker
            selected={timeStringToDate(formData.endTime)}
            onChange={(date) => handleTimeChange('endTime', date)}
            showTimeSelect
            showTimeSelectOnly
            timeIntervals={15}
            timeCaption=""
            dateFormat="HH:mm"
            locale="sv"
            required
            withPortal
            customInput={<CustomDateInput className={styles.input} placeholder="Välj tid..." />}
          />
        </FormGroup>
      </div>

      <FormGroup label="Repetera" className={styles.fieldset}>
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
              <input type="checkbox" checked={formData.selectedWeekdays.includes(day.value)} onChange={() => handleWeekdayChange(day.value)} />
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
      
      <FormGroup label="Information (valfri)">
        <textarea name="description" value={formData.description} onChange={handleInputChange} className={styles.textarea} />
      </FormGroup>

      <Button type="submit" isLoading={isSubmitting}>
        Skapa events
      </Button>

      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
};