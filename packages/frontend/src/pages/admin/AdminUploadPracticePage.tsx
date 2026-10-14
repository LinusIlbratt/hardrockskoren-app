import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import { FormGroup } from '@/components/ui/form/FormGroup';
import styles from './AdminUploadPracticePage.module.scss';

import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { getISOWeek, getYear } from 'date-fns';
import { sv } from 'date-fns/locale';

import { useToast } from '@/context/ToastContext';
import { WeekAccordion } from '@/components/admin/WeekAccordion';
import type { Material } from '@/types';

const API_BASE_URL = import.meta.env.VITE_MATERIAL_API_URL;

interface WeekGroup {
  weekId: string;
  materials: Material[];
}

type PracticeTab = 'weeks' | 'create';

export const AdminUploadPracticePage = () => {
  const [activeTab, setActiveTab] = useState<PracticeTab>('weeks');
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [weeklyMaterials, setWeeklyMaterials] = useState<WeekGroup[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const toast = useToast();

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

  const handleCreateWeek = () => {
    if (!selectedDate) {
      toast.error('Du måste välja ett datum.');
      return;
    }

    const year = getYear(selectedDate);
    const weekNumber = getISOWeek(selectedDate);
    const weekId = `${year}-W${String(weekNumber).padStart(2, '0')}`;

    const weekExists = weeklyMaterials.some(week => week.weekId === weekId);

    if (weekExists) {
      toast.error(`Vecka ${weekNumber} finns redan i listan.`);
      return;
    }

    const newWeek: WeekGroup = {
      weekId: weekId,
      materials: [],
    };
    setWeeklyMaterials(prev => [...prev, newWeek].sort((a, b) => b.weekId.localeCompare(a.weekId)));
    setSelectedDate(null);
    setActiveTab('weeks');
    toast.success(`Vecka ${weekNumber} har skapats. Öppna den för att ladda upp filer.`);
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Sjungupp!</h1>

      <div className={styles.segment} role="tablist" aria-label="Sjungupp">
        <button
          type="button"
          role="tab"
          id="tab-weeks"
          aria-selected={activeTab === 'weeks'}
          aria-controls="panel-weeks"
          className={styles.segmentButton}
          onClick={() => setActiveTab('weeks')}
        >
          Alla veckor
        </button>
        <button
          type="button"
          role="tab"
          id="tab-create"
          aria-selected={activeTab === 'create'}
          aria-controls="panel-create"
          className={styles.segmentButton}
          onClick={() => setActiveTab('create')}
        >
          Skapa vecka
        </button>
      </div>

      {activeTab === 'weeks' ? (
        <section
          id="panel-weeks"
          role="tabpanel"
          aria-labelledby="tab-weeks"
          className={styles.tabPanel}
        >
          {isLoadingList ? (
            <p className={styles.muted}>Laddar veckor...</p>
          ) : weeklyMaterials.length > 0 ? (
            <div className={styles.accordionContainer}>
              {weeklyMaterials.map(week => (
                <WeekAccordion
                  key={week.weekId}
                  weekId={week.weekId}
                  materials={week.materials}
                  onUploadOrDeleteSuccess={fetchWeeklyMaterials}
                />
              ))}
            </div>
          ) : (
            <p className={styles.muted}>Inga veckor ännu.</p>
          )}
        </section>
      ) : (
        <section
          id="panel-create"
          role="tabpanel"
          aria-labelledby="tab-create"
          className={styles.tabPanel}
        >
          <div className={styles.createForm}>
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
                placeholderText="Välj vecka"
              />
            </FormGroup>
            <Button type="button" className={styles.createButton} onClick={handleCreateWeek}>
              Skapa vecka
            </Button>
          </div>
        </section>
      )}
    </div>
  );
};
