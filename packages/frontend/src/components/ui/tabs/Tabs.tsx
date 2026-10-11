import type { ReactNode } from 'react';
import styles from './Tabs.module.scss';

export interface TabsProps {
  /** Namn för skärmläsare, sätts som aria-label på fliklistan. */
  label: string;
  className?: string;
  children: ReactNode;
}

export const Tabs = ({ label, className, children }: TabsProps) => {
  const classes = [styles.list, className].filter(Boolean).join(' ');
  return (
    <div className={classes} role="tablist" aria-label={label}>
      {children}
    </div>
  );
};

export interface TabProps {
  active: boolean;
  onSelect: () => void;
  id?: string;
  controls?: string;
  children: ReactNode;
}

export const Tab = ({ active, onSelect, id, controls, children }: TabProps) => (
  <button
    type="button"
    role="tab"
    id={id}
    aria-selected={active}
    aria-controls={controls}
    className={active ? `${styles.tab} ${styles.active}` : styles.tab}
    onClick={onSelect}
  >
    {children}
  </button>
);
