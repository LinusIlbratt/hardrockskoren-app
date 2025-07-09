// CreateEventForm.tsx - Komplett kod med lösning för mobilvänlig DatePicker

import React, { useState, useEffect, useMemo, forwardRef } from 'react';
import { StyledSelect, type SelectOption } from '@/components/ui/select/StyledSelect';
import DatePicker, { registerLocale } from "react-datepicker"; 
import "react-datepicker/dist/react-datepicker.css"; // Glöm inte att importera CSS för DatePicker
import { sv } from 'date-fns/locale'; 
import { format, parse } from 'date-fns';
registerLocale('sv', sv); 
import * as eventService from '@/services/eventService';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import styles from './CreateEventForm.module.scss';
import type { Event } from '@/types';
import { useAuth } from '@/context/AuthContext';

// --- HJÄLPKOMPONENT FÖR DATEPICKER ---
// Byter ut <input> mot en <button> för att undvika att tangentbordet dyker upp på mobilen.
// forwardRef är nödvändigt för att react-datepicker ska fungera korrekt.
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

// --- PROPS OCH STATE-TYPER ---
interface CreateEventFormProps {
  user: ReturnType<typeof useAuth>['user'];
  groupSlug: string;
  authToken: string;
  eventToEdit: Event | null;
  onSuccess: () => void;
  onClose: () => void;
}

interface FormErrors {
  title?: string;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  eventType?: string;
  general?: string;
}

const initialFormState = {
  title: '',
  eventDate: null as Date | null,
  startTime: '',
  endTime: '',
  eventType: 'REHEARSAL' as 'REHEARSAL' | 'CONCERT',
  description: '',
};


// --- HUVUDKOMPONENT ---
export const CreateEventForm = ({ user, groupSlug, authToken, eventToEdit, onSuccess, onClose }: CreateEventFormProps) => {
  const [formData, setFormData] = useState(initialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const eventTypeOptions = useMemo((): SelectOption[] => {
    const options: SelectOption[] = [
      { value: 'REHEARSAL', label: 'Repetition' },
    ];
    if (user?.role === 'admin') {
      options.push({ value: 'CONCERT', label: 'Konsert' });
    }
    return options;
  }, [user]);

  useEffect(() => {
    if (eventToEdit) {
      const startDate = new Date(eventToEdit.eventDate);
      const endDate = eventToEdit.endDate ? new Date(eventToEdit.endDate) : startDate;

      setFormData({
        title: eventToEdit.title,
        eventDate: startDate,
        startTime: format(startDate, 'HH:mm'),
        endTime: format(endDate, 'HH:mm'),
        eventType: eventToEdit.eventType as 'REHEARSAL' | 'CONCERT',
        description: eventToEdit.description || '',
      });
    } else {
      setFormData(initialFormState);
    }
  }, [eventToEdit]);

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
            withPortal
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
              popperClassName="time-picker-popper"
              withPortal
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
              popperClassName="time-picker-popper"
              withPortal
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

      <FormGroup label="Beskrivning (valfri)">
        <textarea name="description" value={formData.description} onChange={handleInputChange} className={styles.textarea} />
      </FormGroup>

      <div className={styles.buttonGroup}>
        <Button type="button" variant={ButtonVariant.Ghost} onClick={onClose}>
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