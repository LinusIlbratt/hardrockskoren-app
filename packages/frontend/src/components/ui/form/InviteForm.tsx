import { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import styles from './InviteForm.module.scss';
import type { RoleTypes } from '@hrk/core/types';

// Denna URL bör flyttas till en central config-fil
const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

interface InviteFormProps {
  roleToInvite: RoleTypes; // Vilken roll bjuder vi in? 'user' eller 'leader'
  onSuccess: () => void;
}

export const InviteForm = ({ roleToInvite, onSuccess }: InviteFormProps) => {
  const { groupName: groupSlug } = useParams<{ groupName: string }>();
  const [emails, setEmails] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Splittra e-postadresser på kommatecken, ny rad, eller mellanslag och ta bort tomma rader
    const emailList = emails.split(/[\s,]+/).filter(email => email.length > 0);

    if (emailList.length === 0 || !groupSlug) {
      setError("Du måste ange minst en e-postadress.");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    const token = localStorage.getItem('authToken');

    try {
      await axios.post(
        `${API_BASE_URL}/invites`,
        { 
          emails: emailList, 
          groupSlug,
          role: roleToInvite 
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSuccess(); // Anropa för att stänga modalen och meddela föräldern
    } catch (err) {
      setError("Kunde inte skicka inbjudningar. Försök igen.");
      console.error("Invite failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div>
        <textarea
          className={styles.textarea}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="klistra in en eller flera e-postadresser..."
          required
        />
        <p className={styles.description}>Separera flera adresser med kommatecken,</p>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      
      <Button type="submit" isLoading={isLoading}>
        Skicka inbjudan till {roleToInvite === 'user' ? 'medlem' : 'körledare'}
      </Button>
    </form>
  );
};