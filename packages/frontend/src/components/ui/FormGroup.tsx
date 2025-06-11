import React from 'react';
import styles from './FormGroup.module.scss'; // Importera vår nya SCSS-fil

// Definiera vilka props vår komponent kan ta emot.
export interface FormGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  // 'children' är det vi vill svepa in, oftast ett <Input />-fält.
  children: React.ReactNode;
  // Etiketten som visas ovanför inmatningsfältet.
  label?: string;
  // Ett unikt ID är nödvändigt för tillgänglighet.
  htmlFor?: string;
  // Ett felmeddelande att visa
  error?: string | null;
}

export const FormGroup = ({
  className,
  children,
  label,
  htmlFor,
  error,
  ...props
}: FormGroupProps) => {
  // Kombinera de importerade stilarna med eventuella extra klasser
  const groupClasses = `${styles.formGroup} ${className || ''}`;

  return (
    <div className={groupClasses} {...props}>
      {/* Om en label har skickats med, rendera den. */}
      {label && (
        <label htmlFor={htmlFor} className={styles.label}>
          {label}
        </label>
      )}

      {/* Här renderas det inmatningsfält eller den komponent vi skickade in. */}
      {children}

      {/* Om ett 'error' finns, rendera det här */}
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
};
