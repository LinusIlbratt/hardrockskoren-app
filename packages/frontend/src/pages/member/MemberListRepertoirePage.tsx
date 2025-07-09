import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './MemberListRepertoirePage.module.scss';
import axios from 'axios';
import { ChevronRight } from 'lucide-react'; // Ikon för att visa att det är en länk

interface Repertoire {
    repertoireId: string;
    title: string;
    artist: string;
}

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

export const MemberListRepertoirePage = () => {
    // Hämta den aktiva kören från URL:en för en mer pålitlig datahämtning
    const { groupName } = useParams<{ groupName: string }>();
    const [repertoires, setRepertoires] = useState<Repertoire[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchRepertoires = useCallback(async () => {
        if (!groupName) {
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const token = localStorage.getItem('authToken');

        try {
            const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/repertoires`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRepertoires(response.data);
        } catch (error) {
            console.error("Failed to fetch repertoires:", error);
        } finally {
            setIsLoading(false);
        }
    }, [groupName]);

    useEffect(() => {
        fetchRepertoires();
    }, [fetchRepertoires]);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <h2>Repertoar</h2>
                <p>Välj en låt för att se allt material.</p>
            </header>

            {isLoading ? (
                <p>Laddar repertoar...</p>
            ) : (
                <div className={styles.repertoireList}>
                    {repertoires.map(item => (
                        // Hela kortet är nu en länk
                        <Link
                            key={item.repertoireId}
                            to={item.repertoireId}
                            state={{ title: item.title }}
                            className={styles.repertoireItem}
                        >
                            <div className={styles.itemInfo}>
                                <span className={styles.itemTitle}>{item.title}</span>
                                <span className={styles.itemArtist}>{item.artist}</span>
                            </div>
                            <ChevronRight className={styles.itemIcon} size={24} />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
