import React from 'react';
import styles from './Button.module.scss'; // Importera vår nya SCSS-fil
import { Loader, LoaderSize } from '../loader/Loader';

// Definiera props, nu med enklare enums
export enum ButtonVariant {
  Primary = 'primary',
  Destructive = 'destructive',
  Ghost = 'ghost',
}

export enum ButtonSize {
  Small = 'Small',
  Default = 'Default',
  Large = 'Large',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant = ButtonVariant.Primary, 
    size = ButtonSize.Default, 
    isLoading = false, 
    fullWidth = false,
    children, 
    ...props 
  }, ref) => {
    
    // Bygg upp strängen med klassnamn dynamiskt
    const buttonClasses = [
      styles.button, // Grundklassen
      styles[`variant${variant.charAt(0).toUpperCase() + variant.slice(1)}`], // t.ex. styles.variantPrimary
      styles[`size${size.charAt(0).toUpperCase() + size.slice(1)}`],       // t.ex. styles.sizeDefault
      fullWidth && styles.fullWidth,
      className // Eventuella extra klasser från föräldern
    ].filter(Boolean).join(' ');

    return (
      <button
        className={buttonClasses}
        ref={ref}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {/* --- ÄNDRING HÄR --- */}
        {/* Visa alltid loadern om isLoading, men positionera den med CSS */}
        {isLoading && (
          <div className={styles.loaderWrapper}>
            <Loader size={LoaderSize.SMALL} />
          </div>
        )}
        
        {/* Linda in children i en span så vi kan dölja den med CSS */}
        <span className={isLoading ? styles.contentHidden : ''}>
          {children}
        </span>
      </button>
    );
  }
);
Button.displayName = 'Button';