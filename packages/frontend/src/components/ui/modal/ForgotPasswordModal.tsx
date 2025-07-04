// src/components/auth/ForgotPasswordModal.tsx

import React, { useState } from 'react';
import axios from 'axios';
import { Modal } from '@/components/ui/modal/Modal';
import { Input } from '@/components/ui/input/Input';
import { Button } from '@/components/ui/button/Button';
import { FormGroup } from '@/components/ui/form/FormGroup';
import styles from './ForgotPasswordModal.module.scss';

const API_BASE_URL = import.meta.env.VITE_AUTH_API_URL;

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal = ({ isOpen, onClose }: ForgotPasswordModalProps) => {
  // State för att hantera de olika stegen i flödet
  const [step, setStep] = useState<'enterEmail' | 'enterCode' | 'success'>('enterEmail');
  
  // State för formulärdata och felhantering
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  // NYTT: Funktion för att hantera det sista steget
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

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep('enterEmail');
      setEmail('');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setMessage(null);
    }, 300);
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
              <Button type="submit" isLoading={isLoading} fullWidth>Skicka kod</Button>
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
              <Button type="submit" isLoading={isLoading} fullWidth>Återställ lösenord</Button>
            </div>
          </form>
        );

      case 'success':
        return (
          <div className={styles.successContainer}>
            <p>{message}</p>
            <Button onClick={handleClose} fullWidth>Stäng och logga in</Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Återställ lösenord">
      {renderContent()}
    </Modal>
  );
};
