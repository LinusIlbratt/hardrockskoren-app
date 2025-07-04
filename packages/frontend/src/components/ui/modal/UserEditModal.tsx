import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button, ButtonVariant } from '../button/Button';
import styles from './UserEditModal.module.scss';
import type { RoleTypes } from '@hrk/core/types';
import type { GroupMember } from '@/types';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

interface UserEditModalProps {
  user: GroupMember;
  groupSlug: string;
  onClose: () => void;
  onUserUpdate: () => void;
}

export const UserEditModal = ({ user, groupSlug, onClose, onUserUpdate }: UserEditModalProps) => {
  const [editedUser, setEditedUser] = useState(user);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NYTT: State för att styra bekräftelse-modalen
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    setEditedUser(user);
  }, [user]);

  // Denna funktion öppnar nu bara bekräftelse-modalen
  const handleRemoveUserClick = () => {
    setIsConfirmDeleteOpen(true);
  };

  // Denna funktion innehåller den faktiska raderings-logiken
  const executeDelete = async () => {
    setIsSubmitting(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    if (!token) { /* ... felhantering ... */ return; }
    try {
      const response = await fetch(`${API_BASE_URL}/groups/${groupSlug}/users`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: editedUser.email, groupSlug: groupSlug }),
      });
      if (!response.ok) { throw new Error((await response.json()).message || 'Kunde inte ta bort användaren.'); }
      onUserUpdate();
      onClose(); // Stäng den stora modalen när raderingen är klar
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
      setIsConfirmDeleteOpen(false); // Stäng bekräftelse-modalen
    }
  };

  const handleChangeRole = async (newRole: RoleTypes) => {
    if (newRole === editedUser.role) return;
    setIsSubmitting(true);
    setError(null);
    const token = localStorage.getItem('authToken');
    try {
      const response = await fetch(`${API_BASE_URL}/groups/${groupSlug}/users`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: editedUser.email, role: newRole }),
      });
      if (!response.ok) { throw new Error((await response.json()).message || 'Kunde inte uppdatera rollen.'); }
      onUserUpdate();
      setEditedUser(prevUser => ({ ...prevUser, role: newRole }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal isOpen={true} onClose={onClose} title={`Hantera användare`}>
        <div className={styles.profileForm}>
          <div className={styles.profileHeader}>
            <div className={styles.avatar}>
              {editedUser.given_name.charAt(0)}{editedUser.family_name.charAt(0)}
            </div>
            <div className={styles.headerText}>
              <h3 className={styles.fullName}>{editedUser.given_name} {editedUser.family_name}</h3>
              <p className={styles.emailAddress}>{editedUser.email}</p>
            </div>
          </div>

          <div className={styles.formContent}>
            <div className={styles.formGroup}>
              <label>Namn</label>
              <div className={styles.inputRow}>
                <div className={styles.readOnlyField}>{editedUser.given_name}</div>
                <div className={styles.readOnlyField}>{editedUser.family_name}</div>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label>E-postadress</label>
              <div className={styles.readOnlyField}>{editedUser.email}</div>
            </div>
            <div className={styles.formGroup}>
              <label>Roll</label>
              <div className={styles.segmentedControl}>
                <button onClick={() => handleChangeRole('user')} className={editedUser.role === 'user' ? styles.active : ''} disabled={isSubmitting}>
                  Medlem
                </button>
                <button onClick={() => handleChangeRole('leader')} className={editedUser.role === 'leader' ? styles.active : ''} disabled={isSubmitting}>
                  Körledare
                </button>
              </div>
            </div>
          </div>
          
          {error && <p className={styles.errorMessage}>{error}</p>}
          
          <div className={styles.modalFooter}>
            <Button onClick={handleRemoveUserClick} variant={ButtonVariant.Primary} disabled={isSubmitting}>
              Ta bort användare
            </Button>
            <div className={styles.footerActions}>
              <Button onClick={onClose} variant={ButtonVariant.Destructive} disabled={isSubmitting}>
                {isSubmitting ? 'Arbetar...' : 'Stäng'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* NYTT: Bekräftelse-modal för radering */}
      <Modal isOpen={isConfirmDeleteOpen} onClose={() => setIsConfirmDeleteOpen(false)} title="Bekräfta radering">
        <div className={styles.confirmDeleteContent}>
          <p>Är du säker på att du vill ta bort <strong>{editedUser.given_name} {editedUser.family_name}</strong> från kören?</p>
          <div className={styles.confirmDeleteActions}>
            <Button variant={ButtonVariant.Destructive} onClick={() => setIsConfirmDeleteOpen(false)} disabled={isSubmitting}>
              Avbryt
            </Button>
            <Button variant={ButtonVariant.Primary} onClick={executeDelete} isLoading={isSubmitting}>
              Ja, radera
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};