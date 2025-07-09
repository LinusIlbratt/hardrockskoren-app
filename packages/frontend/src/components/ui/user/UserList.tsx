import type { GroupMember } from '@/types';
import { translateRole } from '@/utils/translations';
import styles from './UserList.module.scss';
import { FiEdit } from 'react-icons/fi';

interface UserListProps {
    members: GroupMember[];
    // ✅ ÄNDRING 1: onEditUser är nu valfri (optional) med ett '?'
    onEditUser?: (member: GroupMember) => void;
}

export const UserList = ({ members, onEditUser }: UserListProps) => {
    return (
        <div className={styles.listContainer}>
            <header className={styles.listHeader}>
                <span>#</span>
                <span></span>
                <span>Namn</span>
                <span>E-post</span>
                <span>Roll</span>
                <span></span>
            </header>

            <div className={styles.listBody}>
                {members.map((member, index) => (
                    <article key={member.id} className={styles.listRow}>
                        <span className={styles.cellIndex}>{index + 1}</span>
                        <div className={styles.cellAvatar}>
                            {member.given_name.charAt(0)}{member.family_name.charAt(0)}
                        </div>
                        <span className={styles.cellName}>{member.given_name} {member.family_name}</span>
                        <span className={styles.cellEmail}>{member.email}</span>
                        <span className={styles.cellRole}>{translateRole(member.role)}</span>
                        <div className={styles.cellActions}>
                            {/* ✅ ÄNDRING 2: Knappen visas nu bara om onEditUser-funktionen finns */}
                            {onEditUser && (
                                <button
                                    onClick={() => onEditUser(member)}
                                    className={styles.editButton}
                                    title={`Hantera ${member.given_name}`}
                                >
                                    <FiEdit size={18} />
                                </button>
                            )}
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
};