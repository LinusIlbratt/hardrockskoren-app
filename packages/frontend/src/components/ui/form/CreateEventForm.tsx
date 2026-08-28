import { useState, useEffect, useMemo, forwardRef } from 'react';
import { StyledSelect, type SelectOption } from '@/components/ui/select/StyledSelect';
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { sv } from 'date-fns/locale';
import { format, parse } from 'date-fns';
registerLocale('sv', sv);
import * as eventService from '@/services/eventService';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { DiscardChangesConfirm } from '@/components/ui/form/DiscardChangesConfirm';
import { useModalFormGuard } from '@/hooks/useModalFormGuard';
import { serializeFormState } from '@/utils/formState';
import styles from './CreateEventForm.module.scss';
import type { Event } from '@/types';
import { useAuth } from '@/context/AuthContext';

const CustomDateInput = forwardRef<HTMLButtonElement, { value?: string; onClick?: () => void; className?: string; placeholder?: string }>(
  ({ value, onClick, className, placeholder }, ref) => (
    <button
      type="button"
      className={className}
      onClick={onClick}
      ref={ref}
    >
      {value || placeholder}
    </button>
  )
);
CustomDateInput.displayName = 'CustomDateInput';

interface CreateEventFormProps {
  user: ReturnType<typeof useAuth>['user'];
  groupSlug: string;
  authToken: string;
  eventToEdit: Event | null;
  onSuccess: () => void;
}

interface FormErrors {
  title?: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  eventType?: string;
  general?: string;
}

type FormData = {
  title: string;
  eventDate: Date | null;
  startTime: string;
  endTime: string;
  eventType: 'REHEARSAL' | 'CONCERT';
  description: string;
};

const initialFormState: FormData = {
  title: '',
  eventDate: null,
  startTime: '',
  endTime: '',
  eventType: 'REHEARSAL',
  description: '',
};

function formDataFromEvent(event: Event): FormData {
  const startDate = new Date(event.eventDate);
  const endDate = event.endDate ? new Date(event.endDate) : startDate;

  return {
    title: event.title,
    eventDate: startDate,
    startTime: format(startDate, 'HH:mm'),
    endTime: format(endDate, 'HH:mm'),
    eventType: event.eventType as 'REHEARSAL' | 'CONCERT',
    description: event.description || '',
  };
}

function serializeEventFormData(data: FormData): string {
  return serializeFormState({
    title: data.title,
    // Compare calendar day only — avoids false dirty from timezone/time-of-day on Date.
    eventDate: data.eventDate ? format(data.eventDate, 'yyyy-MM-dd') : null,
    startTime: data.startTime,
    endTime: data.endTime,
    eventType: data.eventType,
    description: data.description,
  });
}

export const CreateEventForm = ({ user, groupSlug, authToken, eventToEdit, onSuccess }: CreateEventFormProps) => {
  const [formData, setFormData] = useState<FormData>(initialFormState);
  const [initialSnapshot, setInitialSnapshot] = useState(serializeEventFormData(initialFormState));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const eventTypeOptions = useMemo((): SelectOption[] => {
    const options: SelectOption[] = [
      { value: 'REHEARSAL', label: 'Rep' },
    ];
    if (user?.role === 'admin') {
      options.push({ value: 'CONCERT', label: 'Gig' });
    }
    return options;
  }, [user]);

  useEffect(() => {
    const nextData = eventToEdit ? formDataFromEvent(eventToEdit) : initialFormState;
    setFormData(nextData);
    setInitialSnapshot(serializeEventFormData(nextData));
    setErrors({});
  }, [eventToEdit]);

  const isDirty = serializeEventFormData(formData) !== initialSnapshot;

  const {
    showDiscardConfirm,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  } = useModalFormGuard({ isDirty, isBlocked: isSubmitting });

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.title.trim()) newErrors.title = 'Titel är obligatoriskt.';
    if (!formData.eventDate) newErrors.eventDate = 'Datum måste väljas.';
    if (!formData.startTime) newErrors.startTime = 'Starttid måste väljas.';
    if (!formData.endTime) newErrors.endTime = 'Sluttid måste väljas.';
    if (!formData.eventType) newErrors.eventType = 'Typ av event måste väljas.';

    if (formData.startTime && formData.endTime && formData.startTime >= formData.endTime) {
      newErrors.endTime = 'Sluttiden måste vara efter starttiden.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

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
    setFormData(prev => ({ ...prev, eventDate: date }));
  };

  const handleTimeChange = (field: 'startTime' | 'endTime', date: Date | null) => {
    if (date) {
      setFormData(prev => ({ ...prev, [field]: format(date, 'HH:mm') }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrors({});

    const dateString = format(formData.eventDate!, 'yyyy-MM-dd');
    const submissionData = {
      title: formData.title,
      eventType: formData.eventType,
      description: formData.description,
      eventDate: new Date(`${dateString}T${formData.startTime}`).toISOString(),
      endDate: new Date(`${dateString}T${formData.endTime}`).toISOString(),
    };

    try {
      if (eventToEdit) {
        await eventService.updateEvent(groupSlug, eventToEdit.eventId, submissionData, authToken);
      } else {
        await eventService.createEvent(groupSlug, submissionData, authToken);
      }
      onSuccess();
    } catch (err: any) {
      console.error("Failed to save event:", err);
      const message = err.response?.data?.message || "Kunde inte spara event. Försök igen.";
      setErrors({ general: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const timeStringToDate = (timeString: string) => {
    if (!timeString) return null;
    return parse(timeString, 'HH:mm', new Date());
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <FormGroup label="Titel" error={errors.title}>
        <Input name="title" type="text" value={formData.title} onChange={handleInputChange} required className={styles.input} />
      </FormGroup>

      <div className={styles.dateTimeRow}>
        <FormGroup label="Datum" error={errors.eventDate}>
          <DatePicker
            selected={formData.eventDate}
            onChange={handleDateChange}
            dateFormat="yyyy-MM-dd"
            locale="sv"
            required
            popperClassName={styles.datePickerPopper}
            customInput={
              <CustomDateInput
                className={styles.input}
                placeholder="Välj datum"
              />
            }
          />
        </FormGroup>

        <div className={styles.timeInputsRow}>
          <FormGroup label="Start" error={errors.startTime} className={styles.timeField}>
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
              popperClassName={styles.datePickerPopper}
              customInput={
                <CustomDateInput
                  className={styles.input}
                  placeholder="Välj tid"
                />
              }
            />
          </FormGroup>

          <FormGroup label="Slut" error={errors.endTime} className={styles.timeField}>
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
              popperClassName={styles.datePickerPopper}
              customInput={
                <CustomDateInput
                  className={styles.input}
                  placeholder="Välj tid"
                />
              }
            />
          </FormGroup>
        </div>
      </div>

      <FormGroup label="Typ av event" error={errors.eventType}>
        <StyledSelect
          name="eventType"
          options={eventTypeOptions}
          value={eventTypeOptions.find(option => option.value === formData.eventType)}
          onChange={(option) => handleSelectChange(option as SelectOption)}
          placeholder="Välj typ..."
        />
      </FormGroup>

      <FormGroup label="Information (valfri)">
        <textarea name="description" value={formData.description} onChange={handleInputChange} className={styles.textarea} />
      </FormGroup>

      {showDiscardConfirm && (
        <DiscardChangesConfirm onConfirm={confirmDiscard} onCancel={cancelDiscard} />
      )}

      <div className={styles.buttonGroup}>
        <Button type="button" variant={ButtonVariant.Ghost} onClick={requestClose} disabled={isSubmitting}>
          Avbryt
        </Button>
        <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
          {eventToEdit ? 'Spara ändringar' : 'Skapa event'}
        </Button>
      </div>

      {errors.general && <p className={styles.generalError}>{errors.general}</p>}
    </form>
  );
};
