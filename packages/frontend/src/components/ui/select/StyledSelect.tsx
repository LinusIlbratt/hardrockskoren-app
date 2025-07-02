import Select, { type StylesConfig, type Props as SelectProps, type GroupBase } from 'react-select';

// Generell typ för alla våra select-options.
export interface SelectOption {
  value: string | number;
  label: string;
}

// All styling bor här.
const customSelectStyles: StylesConfig<SelectOption> = {
  control: (provided, state) => ({
    ...provided,
    backgroundColor: '#1d1d1d',
    borderColor: state.isFocused ? 'var(--color-primary)' : 'var(--color-border)',
    boxShadow: state.isFocused ? '0 0 0 1px var(--color-primary)' : 'none',
    borderRadius: 'var(--radius-md)',
    minHeight: '48px',
    border: '1px solid var(--color-border)',
    cursor: 'pointer',
    '&:hover': {
      borderColor: 'var(--color-primary)',
    },
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: 'var(--color-dark-gray)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
    zIndex: 10,
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected ? 'var(--color-primary)' : state.isFocused ? '#3d3d3d' : 'transparent',
    color: state.isSelected ? 'var(--color-background)' : 'var(--color-text)',
    cursor: 'pointer',
    ':active': {
      backgroundColor: 'var(--color-primary)',
    },
  }),
  singleValue: (provided) => ({ ...provided, color: 'var(--color-text)' }),
  input: (provided) => ({ ...provided, color: 'var(--color-text)' }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (provided) => ({ ...provided, color: '#9ca3af', ':hover': { color: 'white' } }),
};

// Vår återanvändbara wrapper-komponent
export const StyledSelect = <
  T extends SelectOption,
  IsMulti extends boolean = false,
  Group extends GroupBase<T> = GroupBase<T>
> (
  props: SelectProps<T, IsMulti, Group>
) => {
 return (
    <Select<T, IsMulti, Group>
      styles={customSelectStyles as unknown as StylesConfig<T, IsMulti, Group>}
      {...props}
    />
  );
};