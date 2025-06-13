import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { LoginPoster } from '@/components/layout/LoginPoster';
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
        email: email,
        password: password,
      });

      console.log('Fullständigt svar från backend:', response);

      const token = response.data.accessToken;
      localStorage.setItem('authToken', token);

      navigate('/');
    } catch (err) {
      setError('Felaktigt användarnamn eller lösenord.');
      console.error('Login failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.formWrapper}>
        <div className={styles.logo}>
          <h1>HÅRDROCKS</h1>
          <h2>KÖREN</h2>
        </div>
          <form onSubmit={handleSubmit}>
            {/* Här använder vi FormGroup som en återanvändbar komponent */}
            {/* och skickar in en extra klass för layouten. */}
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

            <Button type="submit" isLoading={isLoading}fullWidth>Rock'n Roll</Button>
          </form>
        </div>
        
        {/* ... resten av sidan ... */}

      </div>
      <LoginPoster />
    </main>
  );
};

