import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import type { Material } from '@/types';
import { MediaModal } from '@/components/ui/modal/MediaModal';
import { MediaPlayer } from '@/components/media/MediaPlayer';
import styles from './PracticePage.module.scss';

// Ikoner för olika filtyper
import { FaPlayCircle } from "react-icons/fa";
import { IoEyeOutline } from "react-icons/io5";

// Hämta dina API- och S3-bas-URL:er från .env-filen
const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;
const S3_PUBLIC_URL = import.meta.env.VITE_S3_BUCKET_URL;

export const PracticePage = () => {
    // --- STEG 1: ÅTERINFÖR STATE FÖR INTERAKTIVITET ---
    const [materials, setMaterials] = useState<Material[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [nowPlaying, setNowPlaying] = useState<{ url: string; title: string; } | null>(null);
    const [materialToView, setMaterialToView] = useState<Material | null>(null);

    // --- Datahämtning (oförändrad) ---
    const fetchMaterials = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const token = localStorage.getItem('authToken');

        if (!token) {
            setError("Du måste vara inloggad för att se detta material.");
            setIsLoading(false);
            return;
        }

        try {
            const response = await axios.get(`${API_BASE_URL}/practice/materials`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setMaterials(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
            console.error("Failed to fetch practice materials:", err);
            setError('Kunde inte hämta övningsmaterial. Försök igen senare.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMaterials();
    }, [fetchMaterials]);

    // --- Kategorisering av material (oförändrad) ---
    const { audioFiles, videoFiles, documentFiles } = useMemo(() => {
        const isAudio = (key = '') => key.toLowerCase().match(/\.(mp3|wav|m4a)$/i);
        const isVideo = (key = '') => key.toLowerCase().match(/\.(mp4|mov|webm)$/i);
        const isDocument = (key = '') => key.toLowerCase().match(/\.(pdf|txt|doc|docx)$/i);

        return {
            audioFiles: materials.filter(m => isAudio(m.fileKey)),
            videoFiles: materials.filter(m => isVideo(m.fileKey)),
            documentFiles: materials.filter(m => isDocument(m.fileKey)),
            otherFiles: materials.filter(m => !isAudio(m.fileKey) && !isVideo(m.fileKey) && !isDocument(m.fileKey)),
        };
    }, [materials]);

    // --- STEG 2: UPPDATERA RENDER-FUNKTIONEN MED KNAPPAR ---
    const renderMaterialCategory = (title: string, files: Material[]) => {
        if (files.length === 0) return null;

        const isAudioFile = (key = '') => key.toLowerCase().match(/\.(mp3|wav|m4a)$/i);
        const isVideoFile = (key = '') => key.toLowerCase().match(/\.(mp4|mov|webm)$/i);
        const isDocumentFile = (key = '') => key.toLowerCase().match(/\.(pdf|txt|doc|docx)$/i);

        return (
            <section className={styles.categorySection}>
                <h3>{title}</h3>
                <div className={styles.grid}>
                    <ul className={styles.materialList}>
                        {files.map(material => {
                            const displayName = material.title || material.fileKey;
                            const fullUrl = `${S3_PUBLIC_URL}/${material.fileKey}`;

                            return (
                                // Byt ut <a> mot en <div> eller <li> för att agera container
                                <li key={material.materialId} className={styles.materialItem}>
                                    <span className={styles.materialTitle}>{displayName}</span>
                                    <div className={styles.actions}>
                                        {isAudioFile(material.fileKey) && (
                                            <button onClick={() => setNowPlaying({ url: fullUrl, title: displayName })} className={styles.iconPlay} aria-label={`Spela ${displayName}`}>
                                                <FaPlayCircle size={22} />
                                            </button>
                                        )}
                                        {isVideoFile(material.fileKey) && (
                                            <button onClick={() => setMaterialToView(material)} className={styles.iconPlay} aria-label={`Spela video ${displayName}`}>
                                                <FaPlayCircle size={22} />
                                            </button>
                                        )}
                                        {isDocumentFile(material.fileKey) && (
                                            <button onClick={() => setMaterialToView(material)} className={styles.iconView} aria-label={`Visa ${displayName}`}>
                                                <IoEyeOutline size={24} />
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </section>
        );
    };

    // Huvud-rendering
    if (isLoading) {
        return <div className={styles.page}><p>Laddar övningar...</p></div>;
    }

    if (error) {
        return <div className={styles.page}><p className={styles.errorMessage}>{error}</p></div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h2>Sjungupp Material</h2>
            </div>

            {materials.length > 0 ? (
                <>
                    {renderMaterialCategory("Ljudfiler", audioFiles)}
                    {renderMaterialCategory("Videofiler", videoFiles)}
                    {renderMaterialCategory("Dokument & Texter", documentFiles)}
                    {/* Du kan välja att rendera 'otherFiles' med bara en "Öppna"-länk */}
                </>
            ) : (
                <div className={styles.emptyState}>
                    <p>Det finns inget Sjungupp-material uppladdat ännu.</p>
                </div>
            )}

            {/* --- STEG 3: ÅTERINFÖR MODALS OCH MEDIASPELARE --- */}
            {nowPlaying && (
                <MediaPlayer
                    key={nowPlaying.url}
                    src={nowPlaying.url}
                    title={nowPlaying.title}
                />
            )}

            {materialToView && (
                <MediaModal
                    isOpen={!!materialToView}
                    onClose={() => setMaterialToView(null)}
                    material={materialToView}
                />
            )}
        </div>
    );
};