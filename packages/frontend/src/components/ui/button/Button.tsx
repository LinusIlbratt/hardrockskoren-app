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
  Login = 'Login',
  Logout = 'Logout', // Ny variant för logga ut-knappen
}

export enum ButtonRadius {
  None = 'none',
  Small = 'small',     // Ingen rundning (fyrkantig)
  Medium = 'medium', // Normal rundning
  Pill = 'pill',     // Helt rundad (piller-form)
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  radius?: ButtonRadius;
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    className,
    variant = ButtonVariant.Primary,
    size = ButtonSize.Default,
    radius = ButtonRadius.None,
    isLoading = false,
    fullWidth = false,
    children,
    ...props
  }, ref) => {

    // Bygg upp strängen med klassnamn dynamiskt
    const buttonClasses = [
      styles.button,
      styles[`variant${variant.charAt(0).toUpperCase() + variant.slice(1)}`],
      styles[`size${size.charAt(0).toUpperCase() + size.slice(1)}`],
      radius !== ButtonRadius.None && styles[`radius${radius.charAt(0).toUpperCase() + radius.slice(1)}`],
      // -------------------------
      fullWidth && styles.fullWidth,
      className
    ].filter(Boolean).join(' ');

    return (
      <button
        className={buttonClasses}
        ref={ref}
        disabled={isLoading || props.disabled}
        {...props}
      >

        {isLoading && (
          <div className={styles.loaderWrapper}>
            <Loader size={LoaderSize.REGULAR} />
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