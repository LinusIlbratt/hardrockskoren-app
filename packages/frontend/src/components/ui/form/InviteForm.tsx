import { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { DiscardChangesConfirm } from '@/components/ui/form/DiscardChangesConfirm';
import { useModalFormGuard } from '@/hooks/useModalFormGuard';
import styles from './InviteForm.module.scss';
import type { RoleTypes } from '@hrk/core/types';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

interface InviteFormProps {
  roleToInvite: RoleTypes;
  onSuccess: () => void;
}

export const InviteForm = ({ roleToInvite, onSuccess }: InviteFormProps) => {
  const { groupName: groupSlug } = useParams<{ groupName: string }>();
  const [emails, setEmails] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = emails.trim().length > 0;

  const {
    showDiscardConfirm,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  } = useModalFormGuard({ isDirty, isBlocked: isLoading });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      onSuccess();
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
        <p className={styles.description}>Separera flera adresser med kommatecken,
          och mellanslag. <br></br><br></br>
          Exempel: <br></br>mail@epost.com, mail@epost.com, mail@epost.com
        </p>
      </div>

      {showDiscardConfirm && (
        <DiscardChangesConfirm onConfirm={confirmDiscard} onCancel={cancelDiscard} />
      )}

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.buttonGroup}>
        <Button type="button" variant={ButtonVariant.Ghost} onClick={requestClose} disabled={isLoading}>
          Avbryt
        </Button>
        <Button type="submit" isLoading={isLoading}>
          Skicka inbjudan till {roleToInvite === 'user' ? 'medlem' : 'körledare'}
        </Button>
      </div>
    </form>
  );
};
