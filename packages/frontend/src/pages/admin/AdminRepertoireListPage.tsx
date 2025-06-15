import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
// Vi antar att du skapar denna formulär-komponent senare
// import { CreateRepertoireForm } from '@/components/repertoires/CreateRepertoireForm';

// Definiera en typ för repertoar-objektet
interface Repertoire {
  repertoireId: string;
  title: string;
  artist: string;
}

const API_BASE_URL = 'https://xnlaf0pi16.execute-api.eu-north-1.amazonaws.com';

export const AdminRepertoireListPage = () => {
    console.log("1. AdminRepertoireListPage renderas."); // CHECKPOINT 1
  
    const { groupName } = useParams<{ groupName: string }>();
    const [repertoires, setRepertoires] = useState<Repertoire[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    console.log("2. groupName från URL är:", groupName); // CHECKPOINT 2
  
    // Funktion för att hämta repertoarer
    const fetchRepertoires = useCallback(async () => {
      console.log("4. fetchRepertoires anropas med groupName:", groupName); // CHECKPOINT 4
      if (!groupName) {
        console.log("   - Avbryter: inget groupName.");
        return;
      }
      
      setIsLoading(true);
      const token = localStorage.getItem('authToken');
  
      try {
        console.log("   - Skickar API-anrop till backend..."); // CHECKPOINT 5
        const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/repertoires`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log("   - Svar från backend mottaget:", response.data);
        setRepertoires(response.data);
      } catch (error) {
        console.error("Failed to fetch repertoires:", error);
      } finally {
        setIsLoading(false);
      }
    }, [groupName]);
  
    // Hämta data när komponenten laddas
    useEffect(() => {
      console.log("3. useEffect körs."); // CHECKPOINT 3
      fetchRepertoires();
    }, [fetchRepertoires]);
  
    const onRepertoireCreated = () => {
      setIsModalOpen(false);
      fetchRepertoires();
    }
  
    if (isLoading) {
      return <div>Laddar repertoar...</div>;
    }
  
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2>Låtar i Repertoaren</h2>
          <Button onClick={() => setIsModalOpen(true)}>Skapa ny låt</Button>
        </div>
        
        <ul>
          {repertoires.length > 0 ? (
            repertoires.map(item => (
                <li key={item.repertoireId}>
                {/* KORRIGERING: Vi skickar med låt-objektet som 'state' i länken */}
                <Link 
                  to={`${item.repertoireId}/materials`} 
                  state={{ repertoireTitle: item.title }}
                >
                  {item.title} - {item.artist}
                </Link>
              </li>
            ))
          ) : (
            <p>Inga låtar har lagts till i repertoaren för denna grupp ännu.</p>
          )}
        </ul>
  
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Skapa ny låt i repertoaren"
        >
          <p>Formulär för att skapa ny låt kommer här.</p>
          {/* <CreateRepertoireForm onSuccess={onRepertoireCreated} /> */}
        </Modal>
      </div>
    );
  };