// src/pages/admin/AdminUploadPracticePage.tsx

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import { FormGroup } from '@/components/ui/form/FormGroup';
import styles from './AdminUploadPracticePage.module.scss';

import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { getISOWeek, getYear } from 'date-fns';
import { sv } from 'date-fns/locale';

import { WeekAccordion } from '@/components/admin/WeekAccordion';
import type { Material } from '@/types';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

interface WeekGroup {
  weekId: string;
  materials: Material[];
}

export const AdminUploadPracticePage = () => {
  // State för att skapa nya veckor
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  
  // State för listan och feedback
  const [weeklyMaterials, setWeeklyMaterials] = useState<WeekGroup[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Hämtar alla befintliga veckor från backend
  const fetchWeeklyMaterials = useCallback(async () => {
    setIsLoadingList(true);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get<WeekGroup[]>(`${API_BASE_URL}/practice/materials-by-week`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setWeeklyMaterials(response.data);
    } catch (error) {
      console.error("Failed to fetch weekly materials:", error);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchWeeklyMaterials();
  }, [fetchWeeklyMaterials]);
  
  // Döljer statusmeddelandet efter 4 sekunder
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]); 

  // Den nya funktionen som bara skapar en tom vecka i gränssnittet
  const handleCreateWeek = () => {
    if (!selectedDate) {
      setStatusMessage({ type: 'error', message: 'Du måste välja ett datum.' });
      return;
    }

    const year = getYear(selectedDate);
    const weekNumber = getISOWeek(selectedDate);
    const weekId = `${year}-W${String(weekNumber).padStart(2, '0')}`;

    // Kontrollera om veckan redan finns i listan
    const weekExists = weeklyMaterials.some(week => week.weekId === weekId);

    if (weekExists) {
      setStatusMessage({ type: 'error', message: `Vecka ${weekNumber} finns redan i listan.` });
    } else {
      // Skapa ett nytt, tomt vecko-objekt
      const newWeek: WeekGroup = {
        weekId: weekId,
        materials: [],
      };
      // Lägg till den nya veckan överst i listan och sortera om
      setWeeklyMaterials(prev => [...prev, newWeek].sort((a, b) => b.weekId.localeCompare(a.weekId)));
      setStatusMessage({ type: 'success', message: `Vecka ${weekNumber} har skapats. Klicka på den för att ladda upp filer.` });
    }
  };

  return (
    <div className={styles.page}>
      <section>
        <h1 className={styles.title}>Hantera Sjungupp-material</h1>
        <p className={styles.subtitle}>Börja med att skapa en ny vecka i listan nedan. Klicka sedan på veckan för att ladda upp övningsfiler.</p>
        
        {/* Det nya, förenklade formuläret */}
        <div className={styles.createWeekForm}>
          <FormGroup htmlFor="practice-date" label="Välj en vecka att skapa">
            <DatePicker
              id="practice-date"
              selected={selectedDate}
              onChange={(date: Date | null) => setSelectedDate(date)}
              dateFormat="'Vecka' w, yyyy"
              className={styles.datePicker}
              locale={sv}
              showWeekNumbers
              showWeekPicker
            />
          </FormGroup>
          <Button onClick={handleCreateWeek}>
            Skapa vecka
          </Button>
        </div>

        {statusMessage && <p className={statusMessage.type === 'success' ? styles.successMessage : styles.errorMessage}>{statusMessage.message}</p>}
      </section>

      <hr className={styles.divider} />

      <section className={styles.listSection}>
        <h2 className={styles.title}>Befintligt Sjungupp-material</h2>
        <p className={styles.subtitle}>Klicka på en vecka för att se dess material eller ladda upp fler filer.</p>
        
        {isLoadingList ? (<p>Laddar veckor...</p>)
          : weeklyMaterials.length > 0 ? (
            <div className={styles.accordionContainer}>
              {weeklyMaterials.map(week => (
                <WeekAccordion 
                  key={week.weekId}
                  weekId={week.weekId}
                  materials={week.materials}
                  onUploadOrDeleteSuccess={fetchWeeklyMaterials} // Denna ser till att hela listan laddas om efter en uppladdning/radering
                />
              ))}
            </div>
          ) : (
            <p>Inga Sjungupp-veckor har skapats ännu. Använd formuläret ovan för att skapa den första.</p>
          )}
      </section>
    </div>
  );
};