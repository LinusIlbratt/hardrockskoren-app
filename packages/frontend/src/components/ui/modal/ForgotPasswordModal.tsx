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

/** Samma regler som RegistrationPage: minst 8 tecken, versal, gemen och siffra. */
const PASSWORD_POLICY = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

function passwordPolicyError(password: string): string | null {
  if (password.length < 8) {
    return 'Lösenordet måste vara minst 8 tecken långt.';
  }
  if (!PASSWORD_POLICY.test(password)) {
    return 'Lösenordet måste innehålla minst en stor bokstav, en liten bokstav och en siffra.';
  }
  return null;
}

function isUserFacingMessage(message: string): boolean {
  if (message.length > 240) {
    return false;
  }
  if (/exception/i.test(message)) {
    return false;
  }
  if (/^internal server error\.?$/i.test(message)) {
    return false;
  }
  if (/\bmust be\b|\bis required\b|\bis not allowed\b/i.test(message)) {
    return false;
  }
  if (/<[^>]+>/.test(message) || /[{}[\]]/.test(message)) {
    return false;
  }
  return true;
}

function readApiErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) {
    return fallback;
  }
  const data: unknown = err.response?.data;
  let raw: unknown;
  if (typeof data === 'string') {
    raw = data;
  } else if (data && typeof data === 'object' && 'message' in data) {
    raw = (data as { message?: unknown }).message;
  }
  if (typeof raw !== 'string') {
    return fallback;
  }
  const message = raw.trim();
  if (!message || !isUserFacingMessage(message)) {
    return fallback;
  }
  return message;
}

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
  const [passwordError, setPasswordError] = useState<string | null>(null);
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
    } catch (err: unknown) {
      setError(readApiErrorMessage(err, 'Ett oväntat fel uppstod. Försök igen.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setPasswordError(policyError);
      return;
    }
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setError('Lösenorden matchar inte.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/reset-password`, {
        email,
        code,
        newPassword,
      });
      setMessage(response.data.message);
      setStep('success');
    } catch (err: unknown) {
      const apiMessage = readApiErrorMessage(
        err,
        'Kunde inte återställa lösenordet. Kontrollera koden och försök igen.'
      );
      if (/lösenord/i.test(apiMessage)) {
        setPasswordError(apiMessage);
      } else {
        setError(apiMessage);
      }
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
            <FormGroup label="Nytt lösenord" htmlFor="new-password" error={passwordError}>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(null);
                }}
                placeholder="••••••••••"
                required
                aria-describedby="new-password-hint"
              />
              <p id="new-password-hint" className={styles.hint}>
                Minst 8 tecken, med stor och liten bokstav samt en siffra.
              </p>
            </FormGroup>
            <FormGroup label="Bekräfta nytt lösenord" htmlFor="confirm-password" error={error}>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                placeholder="••••••••••"
                required
              />
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
