import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonRadius, ButtonSize } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { LoginPoster } from '@/components/layout/LoginPoster'; // Importerar postern
import styles from './RegistrationPage.module.scss';
import logoImage from '@/assets/images/hrk-logo.webp';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

interface ValidInvite {
  email: string;
  groupName: string;
}

export const RegistrationPage = () => {
  const [searchParams] = useSearchParams();
  const inviteId = searchParams.get('invite');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<ValidInvite | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  
  useEffect(() => {
    if (!inviteId) {
      setError("Inbjudningskod saknas i URL:en.");
      setIsLoading(false);
      return;
    }
    const validateInvite = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/invites/${inviteId}`);
        setInviteDetails(response.data);
      } catch (err) {
        setError("Denna inbjudan är ogiltig eller har gått ut.");
      } finally {
        setIsLoading(false);
      }
    };
    validateInvite();
  }, [inviteId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await axios.post(`${API_BASE_URL}/invites/${inviteId}/confirm`, {
        given_name: firstName,
        family_name: lastName,
        password: password,
      });
      setIsSuccess(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setError("En användare med denna e-post finns redan.");
      } else {
        setError("Kunde inte skapa kontot. Försök igen.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className={styles.statusMessage}>Laddar och validerar inbjudan...</div>;
    }
    if (error || !inviteDetails) {
      return <div className={styles.statusMessage}>{error || 'Kunde inte ladda inbjudan.'}</div>;
    }
    if (isSuccess) {
      return (
        <div className={styles.successMessage}>
          <h2>Kontot är skapat!</h2>
          <p>Du kan nu logga in med dina nya uppgifter.</p>
          <div className={styles.buttonGroup}>
            <Link to="/login">
              <Button fullWidth radius={ButtonRadius.Small} size={ButtonSize.Login}>
                Gå till inloggning
              </Button>
            </Link>
          </div>
        </div>
      );
    }
    return (
      <>
        <h1 className={styles.title}>Skapa ditt konto</h1>
        <p className={styles.subtitle}>
          Välkommen till kören <strong>{inviteDetails.groupName}</strong>! Fyll i dina uppgifter nedan.
        </p>
        <form onSubmit={handleSubmit}>
          <div className={styles.inputRow}>
            <FormGroup label="Förnamn" htmlFor="first-name">
              <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </FormGroup>
            <FormGroup label="Efternamn" htmlFor="last-name">
              <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </FormGroup>
          </div>
          <FormGroup label="E-post (från inbjudan)" htmlFor="email">
            <Input id="email" type="email" value={inviteDetails.email || ''} disabled />
          </FormGroup>
          <FormGroup label="Välj ett lösenord" htmlFor="password">
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </FormGroup>
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.buttonGroup}>
            <Button type="submit" isLoading={isLoading} fullWidth radius={ButtonRadius.Small} size={ButtonSize.Login}>
              Slutför registrering
            </Button>
          </div>
        </form>
      </>
    );
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <figure className={styles.logo}>
          <img src={logoImage} alt="Logo för Hårdrockskören" />
        </figure>
        <div className={styles.formWrapper}>
          {renderContent()}
        </div>
      </div>
      <LoginPoster />
    </main>
  );
};
