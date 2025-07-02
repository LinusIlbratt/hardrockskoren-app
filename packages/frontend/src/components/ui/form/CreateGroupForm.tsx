import { useState } from 'react';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import axios from 'axios';
import styles from './CreateGroupForm.module.scss';

interface CreateGroupFormProps {
  onSuccess: () => void;
}

// Skapa en typ för vårt error-objekt för bättre typsäkerhet
interface FormErrors {
  name?: string;
  groupSlug?: string;
  description?: string;
  general?: string; // För generella fel, t.ex. nätverksfel
}

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

export const CreateGroupForm = ({ onSuccess }: CreateGroupFormProps) => {
  const [name, setName] = useState('');
  const [groupSlug, setGroupSlug] = useState('');
  const [choirLeader, setChoirLeader] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Använd det nya error-objektet
  const [errors, setErrors] = useState<FormErrors>({});

  // VALIDERINGSFUNKTION
  const validateForm = (): FormErrors => {
    const newErrors: FormErrors = {};

    // Validering för namn
    if (!name.trim()) {
      newErrors.name = 'Namn får inte vara tomt.';
    } else if (name.length < 3) {
      newErrors.name = 'Namnet måste vara minst 3 tecken långt.';
    }

    // Validering för kör-slug (som per dina krav)
    const slugRegex = /^[a-z0-9-]+$/; // Tillåter endast gemener (a-z), siffror (0-9) och bindestreck (-)
    if (!groupSlug.trim()) {
      newErrors.groupSlug = 'Kör-slug får inte vara tomt.';
    } else if (!slugRegex.test(groupSlug)) {
      newErrors.groupSlug = 'Får endast innehålla små bokstäver (a-z), siffror och bindestreck.';
    }

    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({}); // Rensa gamla fel vid nytt försök

    // Steg 1: Validera formuläret på klientsidan
    const formErrors = validateForm();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return; // Avbryt om det finns valideringsfel
    }

    // Steg 2: Fortsätt med API-anropet om valideringen lyckades
    setIsLoading(true);

    const token = localStorage.getItem('authToken');
    if (!token) {
      setErrors({ general: "Autentiseringstoken saknas. Vänligen logga in igen." });
      setIsLoading(false);
      return;
    }

    try {
      await axios.post(
        `${API_BASE_URL}/groups`,
        { name, groupSlug, choirLeader },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      onSuccess(); // Körs vid lyckat anrop
    } catch (err) {
      // Hantera server-specifika fel
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setErrors({ groupSlug: 'En grupp med denna slug eller namn finns redan.' });
      } else {
        setErrors({ general: 'Kunde inte skapa gruppen. Försök igen.' });
      }
      console.error("Create group failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Funktion för att automatiskt generera en slug från namnet
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);

    const newSlug = newName
      .toLowerCase() // Gör allt till gemener
      .replace(/å/g, 'a') // Ersätt å, ä, ö
      .replace(/ä/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/\s+/g, '-') // Ersätt mellanslag med bindestreck
      .replace(/[^a-z0-9-]/g, '') // Ta bort alla ogiltiga tecken
      .slice(0, 50); // Begränsa längden

    setGroupSlug(newSlug);
  };


  return (
  <form onSubmit={handleSubmit} className={styles.form}>
    <FormGroup label="Namn på kör" htmlFor="group-name" error={errors.name}>
      <Input
        id="group-name"
        value={name}
        onChange={handleNameChange}
        required
        className={styles.input}
      />
    </FormGroup>

    <FormGroup label="Kör slug (används i URL)" htmlFor="group-slug" error={errors.groupSlug}>
      <Input
        id="group-slug"
        value={groupSlug}
        onChange={(e) => setGroupSlug(e.target.value)}
        required
        className={styles.input}
      />
    </FormGroup>

    <FormGroup label="Körledare (valfritt)" htmlFor="group-choir-leader" error={errors.description}>
      <Input
        id="group-choir-leader"
        value={choirLeader}
        onChange={(e) => setChoirLeader(e.target.value)}
        placeholder="Ange e-post för körledare"
        required={false} // Gör fältet valfritt
        className={styles.input}
      />
    </FormGroup>

    {/* Visa generella fel som inte är kopplade till ett fält */}
    {errors.general && <p className={styles.generalError}>{errors.general}</p>}

    <Button type="submit" isLoading={isLoading}>
      Skapa Grupp
    </Button>
  </form>
);
};