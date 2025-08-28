// src/pages/PublicChoirListPage.tsx

import { useState, useEffect } from 'react';
import axios from 'axios';
import styles from './PublicChoirListPage.module.scss';
import { FiMapPin, FiMail } from 'react-icons/fi';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

// Typ för den data vi förväntar oss från vårt nya API-endpoint
interface PublicGroup {
  name: string;
  slug: string;
  location: string;
  choirLeader?: string;
}

export const PublicChoirListPage = () => {
  const [choirs, setChoirs] = useState<PublicGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPublicChoirs = async () => {
      setIsLoading(true);
      setError(null);
      const token = localStorage.getItem('authToken');

      try {
        // Anropa det nya, publika endpointet vi skapade
        const response = await axios.get<PublicGroup[]>(`${API_BASE_URL}/groups/public-list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        // Sortera listan i bokstavsordning efter namn
        const sortedChoirs = response.data.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
        setChoirs(sortedChoirs);

      } catch (err) {
        console.error("Failed to fetch public choir list:", err);
        setError("Kunde inte hämta listan med körer. Försök igen senare.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPublicChoirs();
  }, []); // Körs bara en gång när komponenten laddas

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Alla körer</h1>

      {isLoading && <p>Laddar körer...</p>}
      {error && <p className={styles.error}>{error}</p>}
      
      {!isLoading && !error && (
        <div className={styles.choirList}>
          {choirs.map(choir => (
            <div key={choir.slug} className={styles.choirCard}>
              <h2 className={styles.choirName}>{choir.name}</h2>
              <div className={styles.choirLocation}>
                <FiMapPin />
                <span>{choir.location}</span>
              </div>
              <div className={styles.choirLeader}>
                <FiMail />
                <span>{choir.choirLeader || 'Ingen körledare angiven'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};