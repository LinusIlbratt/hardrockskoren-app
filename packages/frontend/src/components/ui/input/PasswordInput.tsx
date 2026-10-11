import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input/Input';
import styles from './PasswordInput.module.scss';

type PasswordInputProps = Omit<InputProps, 'type'>;

/** Lösenordsfält med öga som växlar mellan dolt och synligt. */
export function PasswordInput({ className, disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const fieldClass = [styles.field, className].filter(Boolean).join(' ');

  return (
    <span className={styles.wrap}>
      <Input
        {...props}
        className={fieldClass}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible((current) => !current)}
        disabled={disabled}
        aria-label={visible ? 'Dölj lösenord' : 'Visa lösenord'}
        aria-pressed={visible}
      >
        {visible ? (
          <EyeOff size={18} strokeWidth={1.75} aria-hidden />
        ) : (
          <Eye size={18} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </span>
  );
}
