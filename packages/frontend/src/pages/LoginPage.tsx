import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import axios from 'axios';
import { Button, ButtonSize, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { PasswordInput } from '@/components/ui/input/PasswordInput';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { AuthSplitLayout } from '@/components/layout/AuthSplitLayout/AuthSplitLayout';
import { ForgotPasswordModal } from '@/features/auth';
import styles from './LoginPage.module.scss';

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
      <AuthSplitLayout>
        <form onSubmit={handleSubmit}>
          <FormGroup label="E-post" htmlFor="email" error={error} tone="luxury">
            <Input id="email" type="email" tone="luxury" placeholder="din@epost.se" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </FormGroup>

          <FormGroup label="Lösenord" htmlFor="password" tone="luxury">
            <PasswordInput id="password" tone="luxury" placeholder="••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          </FormGroup>

          <div className={styles.forgotPasswordLink}>
            <button type="button" onClick={() => setIsForgotPasswordOpen(true)}>
              Glömt lösenord?
            </button>
          </div>

          <Button type="submit" variant={ButtonVariant.Luxury} size={ButtonSize.Login} isLoading={isLoading} fullWidth>
            Rock'n Roll
          </Button>
        </form>
      </AuthSplitLayout>

      {/* NYTT: Rendera modalen */}
      <ForgotPasswordModal 
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
      />
    </>
  );
};
