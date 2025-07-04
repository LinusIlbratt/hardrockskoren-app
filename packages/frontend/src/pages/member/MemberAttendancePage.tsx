import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { Input } from '@/components/ui/input/Input'; // Importerar din Input-komponent
import styles from './MemberAttendancePage.module.scss'; // Antar att du återanvänder stilar

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

export const MemberAttendancePage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  
  // State för modalen och formuläret
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [code, setCode] = useState(''); // Håller värdet från input-fältet
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Funktion för att öppna modalen och återställa state
  const openModal = () => {
    setCode('');
    setError(null);
    setSuccessMessage(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // Funktion som körs när formuläret i modalen skickas
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Förhindra att sidan laddas om
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = localStorage.getItem('authToken'); // Exempel

      const response = await fetch(`${API_BASE_URL}/groups/${groupName}/attendance/register`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attendanceCode: code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Något gick fel.');
      }

      setSuccessMessage(data.message || 'Närvaro registrerad!');

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Närvaro</h2>
        <div className={styles.buttonGroup}>
          <Button variant={ButtonVariant.Primary} onClick={openModal}>
            Anmäl närvaro
          </Button>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title="Anmäl din närvaro">
        {/* Om registreringen lyckades, visa ett meddelande */}
        {successMessage ? (
          <div className={styles.successContainer}>
            <p>{successMessage}</p>
            <Button onClick={closeModal}>Stäng</Button>
          </div>
        ) : (
          /* Annars, visa formuläret */
          <form onSubmit={handleRegisterSubmit}>
            <p>Ange den fyrsiffriga koden från din körledare.</p>
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="1234"
              maxLength={4}
              required
              autoFocus
            />
            {error && <p className={styles.errorMessage}>{error}</p>}
            
            <div className={styles.buttonGroup} style={{ marginTop: '1rem' }}>
              <Button type="submit" variant={ButtonVariant.Primary} disabled={isLoading}>
                {isLoading ? 'Registrerar...' : 'Registrera närvaro'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
