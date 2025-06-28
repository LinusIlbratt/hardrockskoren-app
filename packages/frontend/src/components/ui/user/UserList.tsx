// UserList.tsx

import type { GroupMember } from '@/types';
import styles from './UserList.module.scss';
import { FiEdit } from 'react-icons/fi';

interface UserListProps {
    members: GroupMember[];
    onEditUser: (member: GroupMember) => void;
}

export const UserList = ({ members, onEditUser }: UserListProps) => {
    return (
        <div className={styles.listContainer}>
            {/* Headern visas bara på desktop */}
            <header className={styles.listHeader}>
                <span>#</span>      {/* Motsvarar kolumn 1 (cellIndex) */}
                <span></span>      {/* Motsvarar kolumn 2 (cellAvatar), lämnas tom */}
                <span>Namn</span>    {/* Motsvarar kolumn 3 (cellName) */}
                <span>E-post</span>  {/* Motsvarar kolumn 4 (cellEmail) */}
                <span>Roll</span>    {/* Motsvarar kolumn 5 (cellRole) */}
                <span></span>      {/* Motsvarar kolumn 6 (cellActions), lämnas tom */}
            </header>

            <div className={styles.listBody}>
                {members.map((member, index) => (
                    <article key={member.id} className={styles.listRow}>
                        {/* Alla delar är nu direkta barn till listRow */}
                        <span className={styles.cellIndex}>{index + 1}</span>
                        <div className={styles.cellAvatar}>
                            {member.given_name.charAt(0)}{member.family_name.charAt(0)}
                        </div>
                        <span className={styles.cellName}>{member.given_name} {member.family_name}</span>
                        <span className={styles.cellEmail}>{member.email}</span>
                        <span className={styles.cellRole}>{member.role}</span>
                        <div className={styles.cellActions}>
                            <button
                                onClick={() => onEditUser(member)}
                                className={styles.editButton}
                                title={`Hantera ${member.given_name}`}
                            >
                                <FiEdit size={18} />
                            </button>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
};