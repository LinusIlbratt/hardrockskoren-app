import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonSize, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { PasswordInput } from '@/components/ui/input/PasswordInput';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { AuthSplitLayout } from '@/components/layout/AuthSplitLayout/AuthSplitLayout';
import styles from './RegistrationPage.module.scss';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

interface ValidInvite {
  email?: string;
  groupDisplayName?: string;
  groupName?: string;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    const passwordRegex = /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/; 

    if (formData.password.length < 8) {
      errors.password = 'Lösenordet måste vara minst 8 tecken långt.';
    } else if (!passwordRegex.test(formData.password)) {
      // VIKTIGT: Nytt, komplett felmeddelande som inkluderar alla kända krav
      errors.password = 'Lösenordet måste innehålla minst en stor bokstav, en liten bokstav och en siffra.';
    }

    setFormErrors(errors);
    // Denna rad avbryter anropet till handleSubmit om 'errors' inte är tomt.
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // KONTROLLPUNKT: Denna check förhindrar anropet till axios/backend.
    if (!validateForm()) {
      return; // Återgår här om valideringen misslyckas.
    }

    setIsSubmitting(true);
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
      setIsSubmitting(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className={styles.statusMessage}>Laddar och validerar inbjudan...</div>;
    }
    if (!inviteDetails) {
      return <div className={styles.errorMessage}>{apiError || 'Kunde inte ladda inbjudan.'}</div>;
    }
    if (isSuccess) {
      return (
        <div className={styles.successMessage}>
          <h2>Kontot är skapat!</h2>
          <p>Du kan nu logga in med dina nya uppgifter.</p>
          <Link to="/login" className={styles.loginLink}>
            <Button fullWidth variant={ButtonVariant.Luxury} size={ButtonSize.Login}>
              Gå till inloggning
            </Button>
          </Link>
        </div>
      );
    }

    const choirName = (inviteDetails.groupDisplayName ?? inviteDetails.groupName)?.trim() ?? '';

    return (
      <>
        <h1 className={styles.title}>Skapa ditt konto</h1>
        <p className={styles.subtitle}>
          Välkommen till kören{choirName ? <> <strong>{choirName}</strong></> : null}! Fyll i dina uppgifter nedan.
        </p>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.inputRow}>
            <FormGroup label="Förnamn" htmlFor="firstName" error={formErrors.firstName} tone="luxury">
              <Input id="firstName" tone="luxury" value={formData.firstName} onChange={handleChange} />
            </FormGroup>
            <FormGroup label="Efternamn" htmlFor="lastName" error={formErrors.lastName} tone="luxury">
              <Input id="lastName" tone="luxury" value={formData.lastName} onChange={handleChange} />
            </FormGroup>
          </div>
          <FormGroup label="E-post (från inbjudan)" htmlFor="email" tone="luxury">
            <Input id="email" type="email" tone="luxury" value={inviteDetails.email ?? ''} disabled />
          </FormGroup>
          <FormGroup label="Välj ett lösenord" htmlFor="password" error={formErrors.password} tone="luxury">
            <PasswordInput id="password" tone="luxury" value={formData.password} onChange={handleChange} autoComplete="new-password" />
            <p className={styles.passwordHint}>Minst 8 tecken, med stor bokstav, liten bokstav och siffror.</p>
          </FormGroup>
          {apiError && <p className={styles.formError}>{apiError}</p>}
          <div className={styles.buttonGroup}>
            <Button type="submit" variant={ButtonVariant.Luxury} isLoading={isSubmitting} fullWidth size={ButtonSize.Login}>
              Slutför registrering
            </Button>
          </div>
        </form>
      </>
    );
  };

  return (
    <AuthSplitLayout compact>
      {renderContent()}
    </AuthSplitLayout>
  );
};
