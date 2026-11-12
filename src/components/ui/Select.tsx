import { useId } from 'react';
import { Field } from './Field';
import './ui.css';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  label?: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (v: T) => void;
  hint?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function Select<T extends string>({ label, value, options, onChange, hint, disabled, className, ...aria }: SelectProps<T>) {
  const id = useId();
  const select = (
    <select
      id={id}
      className={['ui-select', className].filter(Boolean).join(' ')}
      value={value}
      disabled={disabled}
      aria-label={label ? undefined : aria['aria-label']}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (!label) return select;
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      {select}
    </Field>
  );
}
