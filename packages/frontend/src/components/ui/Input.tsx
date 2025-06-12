import React from 'react';
import styles from './Input.module.scss';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const inputClasses = `${styles.input} ${className || ''}`;
    return <input className={inputClasses} ref={ref} {...props} />;
  }
);