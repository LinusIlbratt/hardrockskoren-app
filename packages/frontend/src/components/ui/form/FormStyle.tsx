import type { StylesConfig } from 'react-select';
import type { Event } from '@/types'; // Se till att denna typ är tillgänglig

// Definiera hur ett option-objekt ser ut
interface SelectOption {
  value: Event['eventType'];
  label: string;
}

// Detta är stil-konfigurationen
export const customSelectStyles: StylesConfig<SelectOption> = {
  control: (provided, state) => ({
    ...provided,
    backgroundColor: 'var(--color-dark-gray)',
    borderColor: state.isFocused ? 'var(--color-primary)' : 'var(--color-border)',
    boxShadow: state.isFocused ? '0 0 0 1px var(--color-primary)' : 'none',
    borderRadius: 'var(--radius-md)',
    minHeight: '48px',
    '&:hover': {
      borderColor: 'var(--color-primary)',
    }
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: 'var(--color-dark-gray)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected ? 'var(--color-primary)' : state.isFocused ? 'var(--color-background-hover-strong)' : 'transparent',
    color: state.isSelected ? 'var(--color-text-on-primary)' : 'var(--color-text)',
    cursor: 'pointer',
    ':active': {
      backgroundColor: 'var(--color-primary)',
    },
  }),
  singleValue: (provided) => ({
    ...provided,
    color: 'var(--color-text)',
  }),
  input: (provided) => ({
    ...provided,
    color: 'var(--color-text)',
  }),
  indicatorSeparator: () => ({
    display: 'none',
  }),
  dropdownIndicator: (provided) => ({
    ...provided,
    color: 'var(--color-text-secondary)',
    ':hover': {
      color: 'var(--color-text)',
    },
  }),
};