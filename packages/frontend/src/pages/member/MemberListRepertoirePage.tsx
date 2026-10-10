import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import styles from './MemberListRepertoirePage.module.scss';
import axios from 'axios';
import { ChevronRight } from 'lucide-react'; // Ikon för att visa att det är en länk
import { sortBySwedishTitle } from '@/utils/sortBySwedishTitle';

interface Repertoire {
    repertoireId: string;
    title: string;
    artist: string;
}

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

function splitTitleAndArtist(title: string, artist?: string): { title: string; artist: string } {
    const trimmedTitle = title.trim();
    const trimmedArtist = artist?.trim() ?? '';
    if (trimmedArtist) {
        return { title: trimmedTitle, artist: trimmedArtist };
    }
    const parts = trimmedTitle.split(/\s+-\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
        return {
            title: parts[0].trim(),
            artist: parts.slice(1).join(' - ').trim(),
        };
    }
    return { title: trimmedTitle, artist: '' };
}

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

    const sortedRepertoires = useMemo(
        () => sortBySwedishTitle(repertoires),
        [repertoires],
    );

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
                    {sortedRepertoires.map(item => {
                        const { title, artist } = splitTitleAndArtist(item.title, item.artist);
                        return (
                        <Link
                            key={item.repertoireId}
                            to={item.repertoireId}
                            state={{ title: item.title }}
                            className={styles.repertoireItem}
                        >
                            <span className={styles.itemInfo}>
                                <span className={styles.itemTitle}>{title}</span>
                                {artist ? <span className={styles.itemArtist}>{artist}</span> : null}
                            </span>
                            <ChevronRight className={styles.itemIcon} size={18} aria-hidden="true" />
                        </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
