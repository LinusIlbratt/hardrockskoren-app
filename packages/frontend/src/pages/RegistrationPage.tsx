import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonRadius, ButtonSize } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { LoginPoster } from '@/components/layout/LoginPoster';
import styles from './RegistrationPage.module.scss';
import logoImage from '@/assets/images/hrk-logo.webp';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

interface ValidInvite {
  email: string;
  groupName: string;
}

// Typer för formulärets data och fel
interface FormData {
  firstName: string;
  lastName: string;
  password: string;
}
interface FormErrors {
  firstName?: string;
  lastName?: string;
  password?: string;
  general?: string;
}

export const RegistrationPage = () => {
  const [searchParams] = useSearchParams();
  const inviteId = searchParams.get('invite');

  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [inviteDetails, setInviteDetails] = useState<ValidInvite | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // State för formulärdata och valideringsfel
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    password: '',
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!inviteId) {
      setApiError("Inbjudningskod saknas i URL:en.");
      setIsLoading(false);
      return;
    }
    const validateInvite = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/invites/${inviteId}`);
        setInviteDetails(response.data);
      } catch (err) {
        setApiError("Denna inbjudan är ogiltig eller har gått ut.");
      } finally {
        setIsLoading(false);
      }
    };
    validateInvite();
  }, [inviteId]);

  // Funktion för att validera formuläret
  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    
    if (!formData.firstName.trim()) {
      errors.firstName = 'Förnamn måste fyllas i.';
    }
    if (!formData.lastName.trim()) {
      errors.lastName = 'Efternamn måste fyllas i.';
    }
    if (formData.password.length < 8) {
      errors.password = 'Lösenordet måste vara minst 8 tecken långt.';
    } else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(formData.password)) {
      errors.password = 'Lösenordet måste innehålla både bokstäver och siffror.';
    }

    setFormErrors(errors);
    // Returnerar true om error-objektet är tomt
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Kör valideringen. Om den misslyckas, avbryt.
    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setApiError(null);
    try {
      await axios.post(`${API_BASE_URL}/invites/${inviteId}/confirm`, {
        given_name: formData.firstName,
        family_name: formData.lastName,
        password: formData.password,
      });
      setIsSuccess(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setApiError("En användare med denna e-post finns redan.");
      } else {
        setApiError("Kunde inte skapa kontot. Försök igen.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className={styles.statusMessage}>Laddar och validerar inbjudan...</div>;
    }
    if (apiError || !inviteDetails) {
      return <div className={styles.statusMessage}>{apiError || 'Kunde inte ladda inbjudan.'}</div>;
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
        <form onSubmit={handleSubmit} noValidate> {/* noValidate förhindrar webbläsarens inbyggda validering */}
          <div className={styles.inputRow}>
            <FormGroup label="Förnamn" htmlFor="firstName" error={formErrors.firstName}>
              <Input id="firstName" value={formData.firstName} onChange={handleChange} />
            </FormGroup>
            <FormGroup label="Efternamn" htmlFor="lastName" error={formErrors.lastName}>
              <Input id="lastName" value={formData.lastName} onChange={handleChange} />
            </FormGroup>
          </div>
          <FormGroup label="E-post (från inbjudan)" htmlFor="email">
            <Input id="email" type="email" value={inviteDetails.email || ''} disabled />
          </FormGroup>
          <FormGroup label="Välj ett lösenord" htmlFor="password" error={formErrors.password}>
            <Input id="password" type="password" value={formData.password} onChange={handleChange} />
            <p className={styles.passwordHint}>Minst 8 tecken, med både bokstäver och siffror.</p>
          </FormGroup>
          {apiError && <p className={styles.formError}>{apiError}</p>}
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
