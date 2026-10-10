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
            {members.map((member) => {
                const displayName = `${member.given_name ?? ''} ${member.family_name ?? ''}`.trim();
                return (
                    <article key={member.groupSlug ? `${member.groupSlug}:${member.id}` : member.id} className={styles.memberCard}>
                        <div className={styles.memberLead}>
                            <div className={styles.avatar} aria-hidden="true">
                                {(member.given_name ?? '').charAt(0)}{(member.family_name ?? '').charAt(0)}
                            </div>
                            <div className={styles.memberText}>
                                <span className={styles.name}>{displayName}</span>
                                {member.choirName ? (
                                    <span className={styles.choir}>{member.choirName}</span>
                                ) : null}
                                <span className={styles.email}>{member.email}</span>
                                <span className={styles.role}>{translateRole(member.role)}</span>
                            </div>
                        </div>
                        {onEditUser && (
                            <button
                                type="button"
                                onClick={() => onEditUser(member)}
                                className={styles.editButton}
                                aria-label={`Hantera ${displayName}`}
                                title={`Hantera ${displayName}`}
                            >
                                <FiEdit size={16} />
                            </button>
                        )}
                    </article>
                );
            })}
        </div>
    );
};