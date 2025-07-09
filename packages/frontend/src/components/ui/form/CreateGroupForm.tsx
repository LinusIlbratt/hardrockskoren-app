import { useState } from 'react';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import axios from 'axios';
import styles from './CreateGroupForm.module.scss';

// FÖRBÄTTRING: Vi behöver en typ för den data som skickas och tas emot.
// Detta gör koden säkrare och enklare att arbeta med.
interface Group {
  id: string;
  name: string;
  groupSlug: string;
  choirLeader?: string;
}

interface CreateGroupFormProps {
  // FÖRBÄTTRING: onSuccess skickar nu tillbaka den nya gruppen.
  // Detta är nödvändigt för att kunna starta den korts-specifika guiden.
  onSuccess: (newGroup: Group) => void;
}

// FÖRBÄTTRING: En typ för formulärdatan.
interface FormData {
  name: string;
  groupSlug: string;
  choirLeader: string;
}

// En typ för vårt error-objekt för bättre typsäkerhet.
// FÖRBÄTTRING: 'groupSlug' är borttagen eftersom fältet är dolt.
interface FormErrors {
  name?: string;
  general?: string; // För generella fel, t.ex. nätverksfel
}

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

export const CreateGroupForm = ({ onSuccess }: CreateGroupFormProps) => {
  // FÖRBÄTTRING: All formulärdata samlas i ett enda state-objekt.
  const [formData, setFormData] = useState<FormData>({
    name: '',
    groupSlug: '',
    choirLeader: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  
  // FÖRBÄTTRING: 'isSlugManuallyEdited' behövs inte längre.

  // Valideringsfunktion
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    const { name } = formData; // Behöver inte längre validera slugen här.

    if (!name.trim()) {
      newErrors.name = 'Namn får inte vara tomt.';
    } else if (name.length < 3) {
      newErrors.name = 'Namnet måste vara minst 3 tecken långt.';
    }

    // FÖRBÄTTRING: Validering för slug är borttagen.

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return; // Avbryt om valideringen misslyckas
    }

    setIsLoading(true);
    setErrors({});
    const token = localStorage.getItem('authToken');

    try {
      // FÖRBÄTTRING: Vi fångar upp svaret från servern.
      const response = await axios.post<Group>(
        `${API_BASE_URL}/groups`,
        formData, // Skicka hela formData-objektet (inklusive den dolda slugen)
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Skicka tillbaka den nya gruppens data till föräldern.
      onSuccess(response.data);
    } catch (err) {
      console.error("Create group failed:", err);
      if (axios.isAxiosError(err)) {
        // FÖRBÄTTRING: Om servern klagar på att slugen finns (409),
        // visar vi nu felet på namn-fältet istället, eftersom det är källan.
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

  // FÖRBÄTTRING: En generell funktion för att hantera ändringar i alla input-fält.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // FÖRBÄTTRING: Funktionen uppdaterar nu alltid slugen baserat på namnet.
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    const newSlug = newName
      .toLowerCase()
      .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 50);
    
    // Uppdatera både namn och slug i vårt state
    setFormData(prev => ({ ...prev, name: newName, groupSlug: newSlug }));
  };

  // FÖRBÄTTRING: 'handleSlugChange' behövs inte längre.

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

      {/* FÖRBÄTTRING: FormGroup och Input för 'groupSlug' är helt borttagna från gränssnittet. */}

      <FormGroup label={<>Körledare <span className={styles.labelHelper}>(valfritt)</span></>} htmlFor="choirLeader">
        <Input
          id="choirLeader"
          name="choirLeader"
          value={formData.choirLeader}
          onChange={handleChange}
          placeholder="Ange namn eller e-post"
        />
      </FormGroup>

      {errors.general && <p className={styles.generalError}>{errors.general}</p>}

      <Button type="submit" isLoading={isLoading} disabled={isLoading}>
        {isLoading ? 'Skapar...' : 'Skapa Kör'}
      </Button>
    </form>
  );
};
