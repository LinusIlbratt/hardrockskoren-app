import React from 'react';
import styles from './FormGroup.module.scss'; 


export interface FormGroupProps extends React.HTMLAttributes<HTMLDivElement> {  
  children: React.ReactNode;  
  label?: string;  
  htmlFor?: string;  
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
  const groupClasses = `${styles.formGroup} ${className || ''}`;

  return (
    <div className={groupClasses} {...props}>      
      {label && (
        <label htmlFor={htmlFor} className={styles.label}>
          {label}
        </label>
      )}
      {children}
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
};
