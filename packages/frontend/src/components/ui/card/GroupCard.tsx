import { NavLink } from "react-router-dom";
import styles from './GroupCard.module.scss'; 

// Denna typ ska matcha datan du får från din 'list groups'-endpoint
export interface Group {
  id: string;
  name: string;
  description: string;
  imageUrl?: string; // En valfri bild-URL
}

interface GroupCardProps {
  group: Group;
  onDelete: (group: Group) => void; // Funktion för att hantera radering
};

// En enkel papperskorgs-ikon
const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);


export const GroupCard = ({ group, onDelete }: GroupCardProps) => {
  // En fallback-bild om ingen imageUrl finns
  const placeholderImage = `https://placehold.co/600x400/121212/D2B48C?text=${group.name}`;

  return (
    <article className={styles.card}>
      <div className={styles.imageWrapper}>
        <img src={group.imageUrl || placeholderImage} alt={`Poster för ${group.name}`} />
        <button 
          className={styles.deleteButton} 
          onClick={() => onDelete(group)}
          aria-label={`Radera gruppen ${group.name}`}
        >
          <TrashIcon />
        </button>
      </div>
      <div className={styles.content}>
        <h2 className={styles.title}>{group.name}</h2>
        <nav className={styles.nav}>
          {/* Notera hur 'to'-sökvägen byggs dynamiskt med gruppens namn */}
          <NavLink to={`/admin/groups/${group.name}/content`} className={styles.navLink}>Innehåll</NavLink>
          <NavLink to={`/admin/groups/${group.name}/users`} className={styles.navLink}>Användare</NavLink>
          <NavLink to={`/admin/groups/${group.name}/overview`} className={styles.navLink}>Översikt</NavLink>
        </nav>
      </div>
    </article>
  );
};