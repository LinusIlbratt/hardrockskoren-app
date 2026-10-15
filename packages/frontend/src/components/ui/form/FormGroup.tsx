import React from 'react';
import styles from './FormGroup.module.scss'; 


export interface FormGroupProps extends React.HTMLAttributes<HTMLDivElement> {  
  children: React.ReactNode;  
  label?: React.ReactNode;  
  htmlFor?: string;  
  error?: string | null;
  tone?: 'default' | 'luxury';
}

export const FormGroup = ({
  className,
  children,
  label,
  htmlFor,
  error,
  tone = 'default',
  ...props
}: FormGroupProps) => {  
  const groupClasses = `${styles.formGroup} ${className || ''}`;
  const labelClasses = [styles.label, tone === 'luxury' && styles.labelLuxury]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={groupClasses} {...props}>      
      {label && (
        <label htmlFor={htmlFor} className={labelClasses}>
          {label}
        </label>
      )}
      {children}
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
};
