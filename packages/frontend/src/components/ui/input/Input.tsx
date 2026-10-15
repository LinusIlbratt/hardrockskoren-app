import React from 'react';
import styles from './Input.module.scss';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  tone?: 'default' | 'luxury';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, tone = 'default', ...props }, ref) => {
    const inputClasses = [styles.input, tone === 'luxury' && styles.toneLuxury, className]
      .filter(Boolean)
      .join(' ');
    return <input className={inputClasses} ref={ref} {...props} />;
  }
);
Input.displayName = 'Input';