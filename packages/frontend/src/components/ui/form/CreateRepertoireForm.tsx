import { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import styles from './CreateRepertoireForm.module.scss';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

interface CreateRepertoireFormProps {
  onSuccess: () => void;
}

export const CreateRepertoireForm = ({ onSuccess }: CreateRepertoireFormProps) => {
  const { groupName } = useParams<{ groupName: string }>();
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName) {
      setError("Kunde inte identifiera kören från URL.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');

    try {
      await axios.post(
        `${API_BASE_URL}/groups/${groupName}/repertoires`,
        { title },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSuccess(); // Anropa för att stänga modalen och uppdatera listan
    } catch (err) {
      setError("Kunde inte skapa låten. Försök igen.");
      console.error("Create repertoire failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <FormGroup label="Låtens titel" htmlFor="repertoire-title">
        <Input
          id="repertoire-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={styles.input}
          required
        />
      </FormGroup>
      
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit" isLoading={isLoading}>Skapa Låt</Button>
    </form>
  );
};