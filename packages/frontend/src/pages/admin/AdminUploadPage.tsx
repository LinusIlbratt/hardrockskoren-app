import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Input } from '@/components/ui/input/Input';
import { FormGroup } from '@/components/ui/form/FormGroup';
import { Modal } from '@/components/ui/modal/Modal';
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
  const { groupName, repertoireId } = useParams<{ groupName: string; repertoireId: string }>();
  const location = useLocation();
  const repertoireTitle = location.state?.repertoireTitle || "Okänd Låt";
  
  // State för formuläret
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  
  // State för materiallistan
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoadingMaterials, setIsLoadingMaterials] = useState(true);

  // State för feedback och laddning
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // State för raderings-modalen
  const [materialToDelete, setMaterialToDelete] = useState<Material | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);


  // Funktion för att hämta material
  const fetchMaterials = useCallback(async () => {
    if (!groupName || !repertoireId) return;
    
    setIsLoadingMaterials(true);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMaterials(response.data);
    } catch (error) {
      console.error("Failed to fetch materials:", error);
    } finally {
      setIsLoadingMaterials(false);
    }
  }, [groupName, repertoireId]);

  // Hämta material när sidan laddas
  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !groupName || !repertoireId) return;

    setIsUploading(true);
    setStatusMessage(null);
    const token = localStorage.getItem('authToken');
    
    try {
      // Steg 1 & 2: Hämta URL och ladda upp filen
      const uploadUrlResponse = await axios.post(`${API_BASE_URL}/materials/upload-url`, { fileName: file.name }, { headers: { Authorization: `Bearer ${token}` } });
      const { uploadUrl, key } = uploadUrlResponse.data;
      await axios.put(uploadUrl, file, { headers: { 'Content-Type': file.type } });

      // Steg 3: Registrera materialet i databasen
      await axios.post(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials`, { title, fileKey: key }, { headers: { Authorization: `Bearer ${token}` } });
      
      setStatusMessage({ type: 'success', message: 'Materialet har laddats upp!' });
      // Nollställ formuläret och hämta listan på nytt
      setTitle('');
      setFile(null);
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      fetchMaterials();

    } catch (error) {
      console.error("Upload failed:", error);
      setStatusMessage({ type: 'error', message: 'Något gick fel.' });
    } finally {
      setIsUploading(false);
    }
  };

  // Funktion för att hantera bekräftelse av radering
  const handleConfirmDelete = async () => {
    if (!materialToDelete || !groupName || !repertoireId) return;
    
    setIsDeleting(true);
    const token = localStorage.getItem('authToken');
    try {
      await axios.delete(`${API_BASE_URL}/groups/${groupName}/repertoires/${repertoireId}/materials/${materialToDelete.materialId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Stäng modalen och hämta listan på nytt
      setMaterialToDelete(null);
      fetchMaterials(); 
    } catch (error) {
      console.error("Failed to delete material:", error);
      alert("Kunde inte radera materialet.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={styles.page}>
      <section>
        <h1 className={styles.title}>
          Hantera material för: <span>{repertoireTitle}</span>
        </h1>
        <p>Kör: {groupName}</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <FormGroup label="Titel på fil (t.ex. Noter, Stämma 1)">
            <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormGroup>
          <FormGroup label="Välj fil">
            <Input id="file-upload" type="file" onChange={handleFileChange} required />
          </FormGroup>
          <Button type="submit" isLoading={isUploading}>Ladda upp</Button>
        </form>
        {statusMessage && <p>{statusMessage.message}</p>}
      </section>

      <hr className={styles.divider} />

      <section>
        <h2 className={styles.title}>Befintligt material</h2>
        {isLoadingMaterials ? (
          <p>Laddar material...</p>
        ) : (
          <ul className={styles.materialList}>
            {materials.length > 0 ? (
              materials.map(material => (
                <li key={material.materialId}>
                  <span>{material.title}</span>
                  <button 
                    onClick={() => setMaterialToDelete(material)}
                    className={styles.deleteButton}
                  >
                    Radera
                  </button>
                </li>
              ))
            ) : (
              <li>Inga material har laddats upp för denna grupp ännu.</li>
            )}
          </ul>
        )}
      </section>

      {/* Modal för att bekräfta radering av material */}
      <Modal 
        isOpen={!!materialToDelete} 
        onClose={() => setMaterialToDelete(null)}
        title="Bekräfta radering"
      >
        <div>
          <p>Är du säker på att du vill radera materialet "{materialToDelete?.title}"?</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <Button variant={ButtonVariant.Ghost} onClick={() => setMaterialToDelete(null)}>
              Avbryt
            </Button>
            <Button variant={ButtonVariant.Destructive} isLoading={isDeleting} onClick={handleConfirmDelete}>
              Ja, radera
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};