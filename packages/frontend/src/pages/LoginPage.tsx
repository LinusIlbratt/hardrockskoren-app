import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import styles from './LoginPage.module.scss';

// Ersätt detta med din riktiga API-URL från en .env-fil
const API_BASE_URL = 'https://ved08b2lvb.execute-api.eu-north-1.amazonaws.com';

export const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/login`, {
        username: email, // Ditt backend förväntar sig troligtvis 'username'
        password: password,
      });

      // Spara token i webbläsarens localStorage
      const token = response.data.idToken;
      localStorage.setItem('authToken', token);

      // Omdirigera till huvudsidan
      navigate('/');

    } catch (err) {
      // Hantera fel från API:et
      setError('Felaktigt användarnamn eller lösenord.');
      console.error('Login failed:', err);
    } finally {
      // Se till att laddnings-state alltid stängs av
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.logo}>
          <h1>HÅRDROCKS</h1>
          <h2>KÖREN</h2>
        </div>

        <div className={styles.formCard}>
          <form onSubmit={handleSubmit}>
            <div className={styles.formGroup}>
              <label htmlFor="email">E-post</label>
              <Input
                id="email"
                type="email"
                placeholder="din@epost.se"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="password">Lösenord</label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {/* Knappen är nu kopplad till isLoading-state */}
            <Button type="submit" isLoading={isLoading}>
              Rock'n Roll
            </Button>
          </form>
        </div>

        {/* Visa ett felmeddelande om det finns ett */}
        {error && <p className="text-red-500 text-center mt-4">{error}</p>}

        <div className={styles.forgotPassword}>
          <a href="#">glömt lösenord</a>
        </div>
      </div>
    </main>
  );
};