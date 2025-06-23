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
      
      <div className={styles.userList}>
        {isLoading ? (
          <p>Laddar medlemmar...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Namn</th>
                <th>E-post</th>
                <th>Roll</th>
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <tr key={member.id}>
                  <td>{member.given_name} {member.family_name}</td>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
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