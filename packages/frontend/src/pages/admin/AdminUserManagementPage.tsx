import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Button, ButtonVariant } from '@/components/ui/button/Button';
import { Modal } from '@/components/ui/modal/Modal';
import { InviteForm } from '@/components/ui/form/InviteForm';
import type { RoleTypes } from '@hrk/core/types';
import styles from './AdminUserManagementPage.module.scss';

// Definiera en typ för en användare i listan
interface GroupMember {
  id: string;
  email: string;
  given_name: string;
  family_name: string;
  role: RoleTypes;
}

const API_BASE_URL = 'https://api.hardrockskoren.se';

export const AdminUserManagementPage = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const [roleToInvite, setRoleToInvite] = useState<RoleTypes | null>(null);

  // --- NY STATE FÖR ANVÄNDARLISTAN ---
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Funktion för att hämta användare
  const fetchMembers = useCallback(async () => {
    if (!groupName) return;
    setIsLoading(true);
    const token = localStorage.getItem('authToken');
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/groups/${groupName}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMembers(response.data);
    } catch (error) {
      console.error("Failed to fetch members:", error);
    } finally {
      setIsLoading(false);
    }
  }, [groupName]);

  // Hämta medlemmar när sidan laddas
  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);


  const handleInviteSuccess = () => {
    setRoleToInvite(null);
    fetchMembers(); // Hämta den uppdaterade medlemslistan!
  };

return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2>Hantera medlemmar</h2>
        <div className={styles.buttonGroup}>
          <Button onClick={() => setRoleToInvite('user')}>Bjud in medlem</Button>
          <Button variant={ButtonVariant.Ghost} onClick={() => setRoleToInvite('leader')}>Bjud in körledare</Button>
        </div>
      </div>
      
      {/* Denna yttre div behåller vi precis som den är */}
      <div className={styles.userList}>
        {isLoading ? (
          <p>Laddar medlemmar...</p>
        ) : (
          // Vi byter ut tabellen mot vår nya grid-container
          <div className={styles.gridContainer}>
            {/* --- Vår nya Header-rad --- */}
            <div className={styles.gridHeader}>
              <span className={styles.gridCell}>Namn</span>
              <span className={styles.gridCell}>E-post</span>
              <span className={styles.gridCell}>Roll</span>
            </div>

            {/* --- Mappa ut varje medlem som en Grid-rad --- */}
            {members.map(member => (
              <div key={member.id} className={styles.gridRow}>
                <span className={styles.gridCell}>{member.given_name} {member.family_name}</span>
                <span className={styles.gridCell}>{member.email}</span>
                <span className={styles.gridCell}>{member.role}</span>
              </div>
            ))}
            
            {members.length === 0 && (
                <p>Inga medlemmar har bjudits in till denna grupp ännu.</p>
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!roleToInvite}
        onClose={() => setRoleToInvite(null)}
        title={`Bjud in ny ${roleToInvite === 'user' ? 'medlem' : 'körledare'}`}
      >
        {roleToInvite && (
          <InviteForm roleToInvite={roleToInvite} onSuccess={handleInviteSuccess} />
        )}
      </Modal>
    </div>
  );
};