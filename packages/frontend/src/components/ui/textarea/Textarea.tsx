import React from 'react';
import styles from './Textarea.module.scss';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    const classes = [styles.textarea, className].filter(Boolean).join(' ');
    return <textarea className={classes} ref={ref} {...props} />;
  }
);
Textarea.displayName = 'Textarea';
