import React from 'react';
import styles from './Button.module.scss'; // Importera vår nya SCSS-fil

// --- LADDNINGSIKON ---
const Loader = () => (
  <svg
    className={styles.loader} // Använd klassen från vår SCSS-fil
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// Definiera props, nu med enklare enums
export enum ButtonVariant {
  Primary = 'primary',
  Destructive = 'destructive',
  Ghost = 'ghost',
}

export enum ButtonSize {
  Small = 'sm',
  Default = 'default',
  Large = 'lg',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant = ButtonVariant.Primary, 
    size = ButtonSize.Default, 
    isLoading = false, 
    children, 
    ...props 
  }, ref) => {
    
    // Bygg upp strängen med klassnamn dynamiskt
    const buttonClasses = [
      styles.button, // Grundklassen
      styles[`variant${variant.charAt(0).toUpperCase() + variant.slice(1)}`], // t.ex. styles.variantPrimary
      styles[`size${size.charAt(0).toUpperCase() + size.slice(1)}`],       // t.ex. styles.sizeDefault
      className // Eventuella extra klasser från föräldern
    ].join(' '); // Sätt ihop dem till en sträng

    return (
      <button
        className={buttonClasses}
        ref={ref}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading ? <Loader /> : children}
      </button>
    );
  }
);
Button.displayName = 'Button';