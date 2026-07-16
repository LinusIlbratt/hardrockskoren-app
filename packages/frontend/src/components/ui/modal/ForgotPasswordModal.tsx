// src/components/auth/ForgotPasswordModal.tsx

import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { Modal } from '@/components/ui/modal/Modal';
import { Input } from '@/components/ui/input/Input';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { DiscardChangesConfirm } from '@/components/ui/form/DiscardChangesConfirm';
import { useModalFormGuard } from '@/hooks/useModalFormGuard';
import styles from './ForgotPasswordModal.module.scss';

const API_BASE_URL = import.meta.env.VITE_AUTH_API_URL;

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function ForgotPasswordModalContent({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'enterEmail' | 'enterCode' | 'success'>('enterEmail');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isDirty = useMemo(() => {
    if (step === 'success') {
      return false;
    }
    if (step === 'enterEmail') {
      return email.trim().length > 0;
    }
    return code.trim().length > 0 || newPassword.length > 0 || confirmPassword.length > 0;
  }, [step, email, code, newPassword, confirmPassword]);

  const {
    showDiscardConfirm,
    requestClose,
    confirmDiscard,
    cancelDiscard,
  } = useModalFormGuard({ isDirty, isBlocked: isLoading, onCloseFallback: onClose });

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/forgot-password`, { email });
      setMessage(response.data.message);
      setStep('enterCode');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Ett oväntat fel uppstod.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Lösenorden matchar inte.");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/reset-password`, {
        email,
        code,
        newPassword,
      });
      setMessage(response.data.message);
      setStep('success');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Kunde inte återställa lösenordet.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    switch (step) {
      case 'enterEmail':
        return (
          <form onSubmit={handleEmailSubmit} className={styles.form}>
            <p className={styles.instructions}>
              Ange din e-postadress så skickar vi en återställningskod till dig.
            </p>
            <FormGroup label="E-post" error={error}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="din@epost.se" required autoFocus />
            </FormGroup>
            <div className={styles.buttonGroup}>
              <Button type="button" variant={ButtonVariant.Ghost} onClick={requestClose} disabled={isLoading}>
                Avbryt
              </Button>
              <Button type="submit" isLoading={isLoading}>Skicka kod</Button>
            </div>
          </form>
        );

      case 'enterCode':
        return (
          <form onSubmit={handleResetSubmit} className={styles.form}>
            <p className={styles.instructions}>{message}</p>
            <FormGroup label="Återställningskod">
              <Input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required />
            </FormGroup>
            <FormGroup label="Nytt lösenord">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••••" required />
            </FormGroup>
            <FormGroup label="Bekräfta nytt lösenord" error={error}>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••••" required />
            </FormGroup>
            <div className={styles.buttonGroup}>
              <Button type="button" variant={ButtonVariant.Ghost} onClick={requestClose} disabled={isLoading}>
                Avbryt
              </Button>
              <Button type="submit" isLoading={isLoading}>Återställ lösenord</Button>
            </div>
          </form>
        );

      case 'success':
        return (
          <div className={styles.successContainer}>
            <p>{message}</p>
            <Button onClick={requestClose} fullWidth>Stäng och logga in</Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {renderContent()}
      {showDiscardConfirm && (
        <DiscardChangesConfirm onConfirm={confirmDiscard} onCancel={cancelDiscard} />
      )}
    </>
  );
}

export const ForgotPasswordModal = ({ isOpen, onClose }: ForgotPasswordModalProps) => (
  <Modal formMode isOpen={isOpen} onClose={onClose} title="Återställ lösenord">
    {isOpen ? <ForgotPasswordModalContent onClose={onClose} /> : null}
  </Modal>
);
