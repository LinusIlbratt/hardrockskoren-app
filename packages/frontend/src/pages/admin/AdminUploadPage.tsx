import { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
// Importera sidans stilar om du har en
// import styles from './AdminUploadPage.module.scss';

// Ersätt med din API-URL
const API_BASE_URL = 'https://xnlaf0pi16.execute-api.eu-north-1.amazonaws.com';

export const AdminUploadPage = () => {
  // Använd useParams för att hämta 'groupName' från URL:en
  const { groupName } = useParams<{ groupName: string }>();

  // State för formuläret
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  
  // State för att hantera API-anrop och feedback
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !groupName) {
      setStatusMessage({ type: 'error', message: 'Alla fält måste fyllas i.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);
    const token = localStorage.getItem('authToken');
    
    try {
      // STEG 1: Hämta signerad URL
      const uploadUrlResponse = await axios.post(
        `${API_BASE_URL}/materials/upload-url`,
        { fileName: file.name },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const { uploadUrl, key } = uploadUrlResponse.data;

      // STEG 2: Ladda upp filen till S3
      await axios.put(uploadUrl, file, {
        headers: { 'Content-Type': file.type },
      });

      // STEG 3: Registrera materialet i databasen
      await axios.post(
        `${API_BASE_URL}/groups/${groupName}/materials`,
        { title, fileKey: key },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setStatusMessage({ type: 'success', message: `'${title}' laddades upp till gruppen '${groupName}'!` });
      // Nollställ formuläret
      setTitle('');
      setFile(null);
      // Rensa fil-input-fältet
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

    } catch (error) {
      console.error("Upload failed:", error);
      setStatusMessage({ type: 'error', message: 'Något gick fel med uppladdningen.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {/* Visa vilken grupp det gäller */}
      <h1>Ladda upp nytt material till: {groupName}</h1>
      
      <form onSubmit={handleSubmit}>
        <FormGroup label="Titel på materialet">
          <Input 
            type="text" 
            value={title} 
            onChange={(e) => setTitle(e.target.value)} 
            placeholder="T.ex. Noter för Låt X"
            required
          />
        </FormGroup>
        
        <FormGroup label="Välj fil">
          <Input 
            id="file-upload"
            type="file" 
            onChange={handleFileChange} 
            required
          />
        </FormGroup>
        
        <Button type="submit" isLoading={isLoading}>Ladda upp</Button>
      </form>

      {/* Visa ett statusmeddelande */}
      {statusMessage && (
        <div className={`status ${statusMessage.type}`}>
          {statusMessage.message}
        </div>
      )}
    </div>
  );
};