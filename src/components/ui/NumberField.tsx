import { useId, useState, type KeyboardEvent } from 'react';
import { Field } from './Field';
import './ui.css';

export interface NumberInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Decimal places shown when not editing (default: from step). */
  precision?: number;
  unit?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

function decimalsOf(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

export function clampNumber(v: number, min?: number, max?: number): number {
  let x = v;
  if (min !== undefined && x < min) x = min;
  if (max !== undefined && x > max) x = max;
  return x;
}

/** Bare numeric input with unit; commits on Enter / blur, arrow keys step. */
export function NumberInput({ value, onChange, min, max, step = 1, precision, unit, id, disabled, className, ...aria }: NumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const digits = precision ?? decimalsOf(step);
  const shown = draft ?? (Number.isFinite(value) ? value.toFixed(digits) : '');

  const commit = (text: string) => {
    setDraft(null);
    const v = parseFloat(text.replace(',', '.'));
    if (Number.isFinite(v)) onChange(clampNumber(v, min, max));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit(e.currentTarget.value);
    else if (e.key === 'Escape') setDraft(null);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const mult = e.shiftKey ? 10 : 1;
      const next = clampNumber(value + (e.key === 'ArrowUp' ? step : -step) * mult, min, max);
      setDraft(null);
      onChange(parseFloat(next.toFixed(Math.max(digits, decimalsOf(step)))));
    }
  };

  return (
    <span className={['ui-number', className].filter(Boolean).join(' ')}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={shown}
        disabled={disabled}
        aria-label={aria['aria-label']}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => draft !== null && commit(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={(e) => e.target.select()}
      />
      {unit && <span className="ui-number__unit">{unit}</span>}
    </span>
  );
}

export interface NumberFieldProps extends Omit<NumberInputProps, 'id'> {
  label: string;
  hint?: string;
}

/** Labeled numeric field with units. */
export function NumberField({ label, hint, ...input }: NumberFieldProps) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <NumberInput id={id} {...input} />
    </Field>
  );
}
