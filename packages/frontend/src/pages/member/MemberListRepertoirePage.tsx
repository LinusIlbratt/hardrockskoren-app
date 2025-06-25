import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Link } from 'react-router-dom';
import styles from './MemberListRepertoirePage.module.scss';
import axios from 'axios';

// Denna typ matchar nu din DynamoDB-struktur
interface Repertoire {
    repertoireId: string;
    title: string;
    artist: string;
}

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export const MemberListRepertoirePage = () => {
    const { user } = useAuth();
    const [repertoires, setRepertoires] = useState<Repertoire[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Funktion för att hämta repertoarer
    const fetchRepertoires = useCallback(async () => {
        // Använd grupp-informationen från user-objektet
        const userGroup = user?.groups?.[0]; // Ta den första gruppen i listan

        // Om vi inte har någon grupp, avbryt
        if (!userGroup) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const token = localStorage.getItem('authToken');

        try {
            const response = await axios.get(`${API_BASE_URL}/groups/${userGroup}/repertoires`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRepertoires(response.data);
        } catch (error) {
            console.error("Failed to fetch repertoires:", error);
        } finally {
            setIsLoading(false);
        }
    }, [user]); // Kör om denna funktion om 'user'-objektet ändras

    // Hämta data när komponenten laddas
    useEffect(() => {
        fetchRepertoires();
    }, [fetchRepertoires]);

    return (
        <div>
            <h1>Repertoar</h1>
            {isLoading ? (
                <p>Laddar...</p>
            ) : (
                <ul className={styles.repertoireList}>
                    {repertoires.map(item => (
                        <li key={item.repertoireId} className={styles.repertoireItem}>
                            {/* Länken pekar nu till den nya, specifika materialsidan */}
                            <Link to={item.repertoireId}>
                                {item.title} - {item.artist}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}   
