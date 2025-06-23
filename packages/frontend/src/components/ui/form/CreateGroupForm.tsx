import { useState } from 'react';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import axios from 'axios';
import styles from './CreateGroupForm.module.scss'; // Importera de nya stilarna

interface CreateGroupFormProps {
  onSuccess: () => void; // En funktion som anropas när gruppen har skapats
}

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

export const CreateGroupForm = ({ onSuccess }: CreateGroupFormProps) => {
  const [name, setName] = useState('');
  const [groupSlug, setGroupSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const token = localStorage.getItem('authToken');
    if (!token) {
      setError("Autentiseringstoken saknas. Vänligen logga in igen.");
      setIsLoading(false);
      return;
    }

    try {
        await axios.post(
          `${API_BASE_URL}/groups`, 
          { name, groupSlug, description }, 
          { 
            headers: { 
              Authorization: `Bearer ${token}` 
            } 
          }
        );
        
        // Efter lyckat anrop, kör onSuccess-funktionen
        // (denna stänger modalen och kan uppdatera listan)
        onSuccess();
  
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 409) {
          setError('En grupp med det namnet finns redan.');
        } else {
          setError('Kunde inte skapa gruppen. Försök igen.');
        }
        console.error("Create group failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <FormGroup label="Namn på kör" htmlFor="group-name">
        {/* Skicka med den nya klassen till Input för att styla den */}
        <Input 
          id="group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={styles.input}
        />
      </FormGroup>
      <FormGroup label="Kör slug" htmlFor="group-slug">
        {/* Skicka med den nya klassen till Input för att styla den */}
        <Input 
          id="group-slug"
          value={groupSlug}
          onChange={(e) => setGroupSlug(e.target.value)}
          required
          className={styles.input}
        />
      </FormGroup>
      <FormGroup label="Beskrivning" htmlFor="group-description">
        <Input
          id="group-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          className={styles.input}
        />
      </FormGroup>

      {error && <p className={styles.error}>{error}</p>}
      
      <Button type="submit" isLoading={isLoading}>Skapa Grupp</Button>
    </form>
  );
};