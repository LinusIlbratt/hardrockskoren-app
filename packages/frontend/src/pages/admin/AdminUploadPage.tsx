import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import styles from './AdminUploadPage.module.scss';

// --- Definiera våra typer ---
interface Material {
  materialId: string;
  title: string;
  fileKey: string;
  createdAt: string;
}

const API_BASE_URL = 'https://xnlaf0pi16.execute-api.eu-north-1.amazonaws.com';

export const AdminUploadPage = () => {
  // Hämta BÅDA parametrarna från URL:en
  const { groupName, repertoireId } = useParams<{ groupName: string; repertoireId: string }>();
  const location = useLocation();
  const repertoireTitle = location.state?.repertoireTitle || "Okänd Låt";
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Funktion för att hämta material för DENNA SPECIFIKA LÅT
  const fetchMaterials = useCallback(async () => {
    if (!groupName || !repertoireId) return;
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMaterials(response.data);
    } catch (error) {
      console.error("Failed to fetch materials:", error);
    }
  }, [groupName, repertoireId]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !groupName || !repertoireId) return;

    setIsLoading(true);
    setStatusMessage(null);
    const token = localStorage.getItem('authToken');
    
    try {
      // Steg 1 & 2: Hämta URL och ladda upp filen
      const uploadUrlResponse = await axios.post(`${API_BASE_URL}/materials/upload-url`, { fileName: file.name }, { headers: { Authorization: `Bearer ${token}` } });
      const { uploadUrl, key } = uploadUrlResponse.data;
      await axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } });

      // Steg 3: Registrera materialet i databasen på RÄTT ställe
      await axios.post(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`, { title, fileKey: key }, { headers: { Authorization: `Bearer ${token}` } });
      
      setStatusMessage('Materialet har laddats upp!');
      setTitle('');
      setFile(null);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      fetchMaterials();

    } catch (error) {
      console.error("Upload failed:", error);
      setStatusMessage('Något gick fel.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {/* Uppdatera titeln för att visa vilken låt det gäller */}
      <h1>Hantera material för: {repertoireTitle}</h1>
      <p>Kör: {groupName}</p>
      
      <form onSubmit={handleSubmit} className={styles.form}>
        <FormGroup label="Titel på fil (t.ex. Noter, Stämma 1)">
          <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </FormGroup>
        <FormGroup label="Välj fil">
          <Input id="file-upload" type="file" onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)} required />
        </FormGroup>
        <Button type="submit" isLoading={isLoading}>Ladda upp</Button>
      </form>
      {statusMessage && <p>{statusMessage}</p>}
      
      <hr />

      <h2>Befintligt material</h2>
      <ul>
        {materials.map(material => (
          <li key={material.materialId}>{material.title}</li>
        ))}
      </ul>
    </div>
  );
};