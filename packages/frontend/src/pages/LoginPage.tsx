import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { LoginPoster } from '@/components/layout/LoginPoster';
import styles from './LoginPage.module.scss';
import logoImage from '@/assets/images/hrk-logo.webp';

// Ersätt detta med din riktiga API-URL från en .env-fil
const API_BASE_URL = import.meta.env.VITE_AUTH_API_URL;

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login, user } = useAuth(); // Hämta login-funktionen och user-objektet

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Denna useEffect lyssnar efter att 'user'-objektet har uppdaterats.
  // När det inte längre är null, vet vi att inloggningen lyckades.
  useEffect(() => {
    if (user) {
      navigate('/'); // Omdirigera till dashboard
    }
  }, [user, navigate]);


  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // KORRIGERING: Skicka ett enkelt objekt med 'email' och 'password'
      // precis som din backend förväntar sig.
      const response = await axios.post(`${API_BASE_URL}/login`, {
        email: email,
        password: password,
      });

      const token = response.data.accessToken;
      if (token) {
        // Anropa den centrala login-funktionen istället för att hantera det själv
        await login(token);
      } else {
        setError('Inloggningen misslyckades.');
      }

    } catch (err) {
      setError('Felaktigt användarnamn eller lösenord.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>

        {/* STEG 1: Loggan ligger nu här, direkt i containern. */}
        <figure className={styles.logo}>
          <img src={logoImage} alt="Logo för Hårdrockskören" />
        </figure>

        {/* STEG 2: FormWrapper innehåller nu BARA formuläret. */}
        <div className={styles.formWrapper}>
          <form onSubmit={handleSubmit}>
            <FormGroup
              label="E-post"
              htmlFor="email"
              error={error}
              className={styles.formField}
            >
              <Input
                id="email"
                type="email"
                placeholder="din@epost.se"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </FormGroup>

            <FormGroup
              label="Lösenord"
              htmlFor="password"
              className={`${styles.formField} ${styles.lastFormField}`}
            >
              <Input
                id="password"
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </FormGroup>

            <Button type="submit" isLoading={isLoading} fullWidth>Rock'n Roll</Button>
          </form>
        </div>

      </div>
      <LoginPoster />
    </main>
  );
};

