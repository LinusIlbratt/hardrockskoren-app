import { NavLink } from "react-router-dom";
import styles from './GroupCard.module.scss'; 

// Denna typ ska matcha datan du får från din 'list groups'-endpoint
export interface Group {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl?: string; // En valfri bild-URL
}

// ÄNDRING: Uppdaterat interface för att ta emot nya, valfria props
interface GroupCardProps {
  group: Group;
  onDelete?: (group: Group) => void; // Gjort valfri
  isLink?: boolean;                  // Ny prop för att agera som länk
  destination?: string;              // Ny prop för länkens destination
  'data-tour'?: string;              // Prop för tour-attribut
};

// En enkel papperskorgs-ikon
const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);


export const GroupCard = ({ group, onDelete, isLink = false, destination = '#', 'data-tour': dataTour }: GroupCardProps) => {
  // En fallback-bild om ingen imageUrl finns
  const placeholderImage = `https://placehold.co/600x400/121212/D2B48C?text=${group.name}`;

  // Vi skapar en intern komponent för att undvika kodduplicering
  const CardContent = (
    <>
      <div className={styles.imageWrapper}>
        <img src={group.imageUrl || placeholderImage} alt={`Poster för ${group.name}`} />
        {/* Visa bara delete-knappen om onDelete-funktionen har skickats med */}
        {onDelete && (
          <button 
            className={styles.deleteButton} 
            onClick={(e) => {
              // Om kortet är en länk, förhindra att klicket navigerar vidare
              if (isLink) e.preventDefault(); 
              onDelete(group);
            }}
            aria-label={`Radera kören ${group.name}`}
          >
            <TrashIcon />
          </button>
        )}
      </div>
      <div className={styles.content}>
        <h2 className={styles.title}>{group.name}</h2>
        {/* Visa bara de interna nav-länkarna om kortet INTE är en länk (dvs. för admin-vyn) */}
        {!isLink && (
          <nav className={styles.nav}>
            <NavLink to={`/admin/groups/${group.slug}/repertoires`} className={styles.navLink}>Repertoar</NavLink>
            <NavLink to={`/admin/groups/${group.slug}/practice`} className={styles.navLink}>Sjungupp!</NavLink>
            <NavLink to={`/admin/groups/${group.slug}/concerts`} className={styles.navLink}>Konserter & repdatum</NavLink>
            <NavLink to={`/admin/groups/${group.slug}/users`} className={styles.navLink}>Användare</NavLink>
            <NavLink to={`/admin/groups/${group.slug}/attendance`} className={styles.navLink}>Närvaro</NavLink>
          </nav>
        )}
      </div>
    </>
  );

  // Om isLink är true, rendera allt inuti en NavLink. Annars, en vanlig article.
  if (isLink) {
    return (
      <NavLink to={destination} className={`${styles.card} ${styles.cardLink}`} data-tour={dataTour}>
        {CardContent}
      </NavLink>
    );
  }

  return (
    <article className={styles.card} data-tour={dataTour}>
      {CardContent}
    </article>
  );
};
