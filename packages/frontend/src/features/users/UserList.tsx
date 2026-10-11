import type { GroupMember } from '@/types';
import { formatMemberName, memberNameInitials, parseMemberName } from '@/utils/memberName';
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
                const parsedName = parseMemberName(member);
                const displayName = formatMemberName(parsedName);
                return (
                    <article key={member.groupSlug ? `${member.groupSlug}:${member.id}` : member.id} className={styles.memberCard}>
                        <div className={styles.memberLead}>
                            <div className={styles.avatar} aria-hidden="true">
                                {memberNameInitials(parsedName)}
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