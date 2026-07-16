import { useState } from 'react';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { DiscardChangesConfirm } from '@/components/ui/form/DiscardChangesConfirm';
import { useModalFormGuard } from '@/hooks/useModalFormGuard';
import { serializeFormState } from '@/utils/formState';
import axios from 'axios';
import styles from './CreateGroupForm.module.scss';

interface Group {
  id: string;
  name: string;
  groupSlug: string;
  choirLeader?: string;
  location: string;
}

interface CreateGroupFormProps {
  onSuccess: (newGroup: Group) => void;
}

interface FormData {
  name: string;
  groupSlug: string;
  choirLeader: string;
  location: string;
}

interface FormErrors {
  name?: string;
  location?: string;
  general?: string;
}

const initialFormState: FormData = {
  name: '',
  groupSlug: '',
  choirLeader: '',
  location: '',
};

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

export const CreateGroupForm = ({ onSuccess }: CreateGroupFormProps) => {
  const [formData, setFormData] = useState<FormData>(initialFormState);
  const [initialSnapshot] = useState(serializeFormState(initialFormState));
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const isDirty = serializeFormState(formData) !== initialSnapshot;

  const {
    showDiscardConfirm,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  } = useModalFormGuard({ isDirty, isBlocked: isLoading });

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    const { name, location } = formData;

    if (!name.trim()) {
      newErrors.name = 'Namn får inte vara tomt.';
    } else if (name.length < 3) {
      newErrors.name = 'Namnet måste vara minst 3 tecken långt.';
    }

    if (!location.trim()) {
      newErrors.location = 'Plats får inte vara tomt.';
    } else if (location.length < 2) {
      newErrors.location = 'Plats måste vara minst 2 tecken långt.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});
    const token = localStorage.getItem('authToken');

    try {
      const response = await axios.post<Group>(
        `${API_BASE_URL}/groups`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSuccess(response.data);
    } catch (err) {
      console.error("Create group failed:", err);
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 409) {
          setErrors({ name: 'En kör med detta namn eller slug finns redan.' });
        } else {
          const message = err.response?.data?.message || 'Ett oväntat fel inträffade. Försök igen.';
          setErrors({ general: message });
        }
      } else {
        setErrors({ general: 'Ett okänt fel inträffade.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    const newSlug = newName
      .toLowerCase()
      .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 50);

    setFormData(prev => ({ ...prev, name: newName, groupSlug: newSlug }));
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <FormGroup label="Namn på kör" htmlFor="name" error={errors.name}>
        <Input
          id="name"
          name="name"
          value={formData.name}
          onChange={handleNameChange}
          required
        />
      </FormGroup>

      <FormGroup label="Plats (stad)" htmlFor="location" error={errors.location}>
        <Input
          id="location"
          name="location"
          value={formData.location}
          onChange={handleChange}
          required
        />
      </FormGroup>

      <FormGroup label={<>Körledare <span className={styles.labelHelper}>(valfritt)</span></>} htmlFor="choirLeader">
        <Input
          id="choirLeader"
          name="choirLeader"
          value={formData.choirLeader}
          onChange={handleChange}
          placeholder="Ange e-post"
        />
      </FormGroup>

      {showDiscardConfirm && (
        <DiscardChangesConfirm onConfirm={confirmDiscard} onCancel={cancelDiscard} />
      )}

      {errors.general && <p className={styles.generalError}>{errors.general}</p>}

      <div className={styles.buttonGroup}>
        <Button type="button" variant={ButtonVariant.Ghost} onClick={requestClose} disabled={isLoading}>
          Avbryt
        </Button>
        <Button type="submit" isLoading={isLoading} disabled={isLoading}>
          {isLoading ? 'Skapar...' : 'Skapa Kör'}
        </Button>
      </div>
    </form>
  );
};
