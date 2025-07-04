import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Button, ButtonRadius, ButtonSize } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { LoginPoster } from '@/components/layout/LoginPoster';
import { ForgotPasswordModal } from '@/components/ui/modal/ForgotPasswordModal';
import styles from './LoginPage.module.scss';
import logoImage from '@/assets/images/hrk-logo.webp';

const API_BASE_URL = import.meta.env.VITE_AUTH_API_URL;

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // NYTT: State för att styra modalen
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);


  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/login`, { email, password });
      const token = response.data.accessToken;
      if (token) {
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
    <>
      <main className={styles.page}>
        <div className={styles.container}>
          <figure className={styles.logo}>
            <img src={logoImage} alt="Logo för Hårdrockskören" />
          </figure>

          <div className={styles.formWrapper}>
            <form onSubmit={handleSubmit}>
              <FormGroup label="E-post" htmlFor="email" error={error} className={styles.formField}>
                <Input id="email" type="email" placeholder="din@epost.se" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </FormGroup>

              <FormGroup label="Lösenord" htmlFor="password" className={`${styles.formField} ${styles.lastFormField}`}>
                <Input id="password" type="password" placeholder="••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </FormGroup>

              {/* NYTT: Länk för att öppna modalen */}
              <div className={styles.forgotPasswordLink}>
                <button type="button" onClick={() => setIsForgotPasswordOpen(true)}>
                  Glömt lösenord?
                </button>
              </div>

              <div className={styles.buttonGroup}>
                <Button type="submit" radius={ButtonRadius.Small} size={ButtonSize.Login} isLoading={isLoading} fullWidth>
                  Rock'n Roll
                </Button>
              </div>
            </form>
          </div>
        </div>
        <LoginPoster />
      </main>

      {/* NYTT: Rendera modalen */}
      <ForgotPasswordModal 
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
      />
    </>
  );
};
