import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_ADMIN_API_URL;

/**
 * En custom hook för att hantera all logik kring närvaroanmälan för en medlem.
 */
export const useAttendance = () => {
    const { user } = useAuth();

    // State för att hantera modalen och formuläret
    const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    /**
     * Öppnar modalen och återställer formulärets state.
     */
    const openAttendanceModal = () => {
        setCode('');
        setError(null);
        setSuccessMessage(null);
        setIsAttendanceModalOpen(true);
    };

    /**
     * Hanterar inskickning av närvarokoden.
     */
    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        // Använder den första gruppen i användarens lista.
        const groupSlug = user?.groups?.[0];

        if (!groupSlug) {
            setError("Kunde inte hitta din grupp. Kontakta en administratör.");
            setIsLoading(false);
            return;
        }

        try {
            const token = localStorage.getItem('authToken'); // Exempel

            const response = await fetch(`${API_BASE_URL}/groups/${groupSlug}/attendance/register`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ attendanceCode: code }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Något gick fel.');
            }

            setSuccessMessage(data.message || 'Närvaro registrerad!');

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Returnera all state och alla funktioner som komponenten behöver
    return {
        isAttendanceModalOpen,
        setIsAttendanceModalOpen,
        code,
        setCode,
        isLoading,
        error,
        successMessage,
        openAttendanceModal,
        handleRegisterSubmit,
    };
};