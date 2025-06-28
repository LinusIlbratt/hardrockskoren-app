import { useState } from 'react';
import { Modal } from './Modal';
import { Button, ButtonVariant } from '../button/Button';
import styles from './UserEditModal.module.scss';
import type { RoleTypes } from '@hrk/core/types';
import type { GroupMember } from '@/types';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

/**
 * Props för UserEditModal-komponenten.
 * Kräver 'groupSlug' för att kunna bygga korrekta API-anrop.
 */
interface UserEditModalProps {
  user: GroupMember;
  groupSlug: string;
  onClose: () => void;
  onUserUpdate: () => void;
}

export const UserEditModal = ({ user, groupSlug, onClose, onUserUpdate }: UserEditModalProps) => {
  // State för att hantera laddning (för att inaktivera knappar) och visa fel.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Hanterar borttagning av en användare från gruppen.
   * Anropar DELETE /api/groups/{groupSlug}/users
   */
  const handleRemoveUser = async () => {
    // Använd window.confirm för en enkel men effektiv bekräftelsedialog.
    if (window.confirm(`Är du säker på att du vill ta bort ${user.given_name} från kören?`)) {
      setIsSubmitting(true);
      setError(null);

      const token = localStorage.getItem('authToken');
    if (!token) {
      setError("Autentiseringstoken saknas. Vänligen logga in igen.");
      setIsLoading(false);
      return;
    }

      try {
        const response = await fetch(`${API_BASE_URL}/groups/${groupSlug}/users`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` 
           },
          body: JSON.stringify({ email: user.email, groupSlug: groupSlug }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Kunde inte ta bort användaren.');
        }

        onUserUpdate(); // Ladda om listan på huvudsidan
        onClose();      // Stäng modalen
      } catch (err: any) {
        setError(err.message);
        console.error("Failed to remove user:", err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  /**
   * Hanterar uppdatering av en användares roll.
   * Anropar PATCH /api/groups/{groupSlug}/users
   */
  const handleChangeRole = async (newRole: RoleTypes) => {
    // Gör inget om man klickar på den redan aktiva rollen.
    if (newRole === user.role) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/groups/${groupSlug}/users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, role: newRole }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Kunde inte uppdatera rollen.');
      }

      // Anropa onUserUpdate för att hämta den nya datan. Detta kommer att
      // uppdatera 'user'-propen och visa rätt aktiv knapp automatiskt.
      onUserUpdate();
    } catch (err: any) {
      setError(err.message);
      console.error("Failed to change role:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

 return (
  <Modal isOpen={true} onClose={onClose} title={`Hantera användare`}>
    <div className={styles.profileForm}>

      {/* Sektion 1: Header med avatar, namn och e-post */}
      <div className={styles.profileHeader}>
        <div className={styles.avatar}>
          {user.given_name.charAt(0)}{user.family_name.charAt(0)}
        </div>
        <div className={styles.headerText}>
          <h3 className={styles.fullName}>{user.given_name} {user.family_name}</h3>
          <p className={styles.emailAddress}>{user.email}</p>
        </div>
      </div>

      {/* Sektion 2: Formulärinnehåll */}
      <div className={styles.formContent}>
        <div className={styles.formGroup}>
          <label htmlFor="firstName">Name</label>
          <div className={styles.inputRow}>
            <input id="firstName" type="text" value={user.given_name} readOnly className={styles.inputField} />
            <input type="text" value={user.family_name} readOnly className={styles.inputField} />
          </div>
        </div>
        
        <div className={styles.formGroup}>
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" value={user.email} readOnly className={styles.inputField} />
        </div>

        <div className={styles.formGroup}>
          <label>Roll</label>
          <div className={styles.segmentedControl}>
            <button
              onClick={() => handleChangeRole('user')}
              className={user.role === 'user' ? styles.active : ''}
              disabled={isSubmitting}
            >
              Medlem
            </button>
            <button
              onClick={() => handleChangeRole('leader')}
              className={user.role === 'leader' ? styles.active : ''}
              disabled={isSubmitting}
            >
              Körledare
            </button>
          </div>
        </div>
      </div>
      
      {/* Felmeddelande visas vid behov */}
      {error && <p className={styles.errorMessage}>{error}</p>}
      
      {/* Sektion 3: Sidfot med åtgärdsknappar */}
      <div className={styles.modalFooter}>
        <Button 
          onClick={handleRemoveUser} 
          variant={ButtonVariant.Destructive}
          disabled={isSubmitting}
          isLoading={isLoading}
        >
          Delete user
        </Button>
        <div className={styles.footerActions}>
          <Button 
            onClick={onClose} 
            variant={ButtonVariant.Primary}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Arbetar...' : 'Stäng'}
          </Button>
        </div>
      </div>

    </div>
  </Modal>
);
};