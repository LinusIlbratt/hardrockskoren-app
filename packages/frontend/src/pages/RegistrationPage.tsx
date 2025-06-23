import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom'; // Importera Link
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import styles from './RegistrationPage.module.scss';

// Denna URL bör flyttas till en central config-fil
const API_BASE_URL = 'https://api.hardrockskoren.se';

// Definierar datan vi får tillbaka när vi validerar en inbjudan
interface ValidInvite {
  email: string;
  groupName: string;
}

export const RegistrationPage = () => {
  const [searchParams] = useSearchParams();
  const inviteId = searchParams.get('invite');

  // State för att hantera flödet
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<ValidInvite | null>(null);
  const [isSuccess, setIsSuccess] = useState(false); // Ny state för success-meddelande

  // State för själva formuläret
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  
  // Detta körs en gång när sidan laddas för att validera inbjudan
  useEffect(() => {
    if (!inviteId) {
      setError("Inbjudningskod saknas i URL:en.");
      setIsLoading(false);
      return;
    }

    const validateInvite = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/admin/invites/${inviteId}`);
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
      await axios.post(`${API_BASE_URL}/admin/invites/${inviteId}/confirm`, {
        given_name: firstName,
        family_name: lastName,
        password: password,
      });

      // Istället för att navigera, sätter vi success-state till true
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

  if (isLoading) {
    return <div className={styles.page}>Laddar och validerar inbjudan...</div>;
  }

  if (error || !inviteDetails) {
    return <div className={styles.page}><div className={styles.errorMessage}>{error || 'Kunde inte ladda inbjudan.'}</div></div>;
  }

  // Om registreringen lyckades, visa success-meddelandet istället för formuläret
  if (isSuccess) {
    return (
        <main className={styles.page}>
            <div className={styles.container}>
                <div className={styles.successMessage}>
                    <h2>Kontot är skapat!</h2>
                    <p>Ditt konto har skapats. Du kan nu logga in.</p>
                    <p style={{ marginTop: '1rem' }}>
                        <Link to="/login">Gå till inloggningssidan</Link>
                    </p>
                </div>
            </div>
        </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Skapa ditt konto</h1>
        <p className={styles.subtitle}>
          Välkommen till kören <strong>{inviteDetails.groupName}</strong>! Fyll i dina uppgifter nedan.
        </p>

        <div className={styles.formWrapper}>
          <form onSubmit={handleSubmit}>
            <FormGroup label="Förnamn" htmlFor="first-name">
              <Input
                id="first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </FormGroup>
            <FormGroup label="Efternamn" htmlFor="last-name">
              <Input
                id="last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </FormGroup>
            <FormGroup label="E-post (från inbjudan)" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={inviteDetails.email || ''}
                disabled // E-postfältet kan inte ändras
              />
            </FormGroup>
            <FormGroup label="Välj ett lösenord" htmlFor="password">
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </FormGroup>
            <Button type="submit" isLoading={isLoading}>Slutför registrering</Button>
          </form>
        </div>
      </div>
    </main>
  );
};