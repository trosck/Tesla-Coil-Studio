import type { ReactNode } from 'react';
import './ui.css';

export interface FieldProps {
  label: ReactNode;
  /** id of the control the label points to. */
  htmlFor?: string;
  hint?: ReactNode;
  /** Right-aligned content on the label row (e.g. current value). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + control + optional hint. */
export function Field({ label, htmlFor, hint, aside, children, className }: FieldProps) {
  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')}>
      <div className="ui-field__row">
        <label className="ui-field__label" htmlFor={htmlFor}>
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint && <div className="ui-field__hint">{hint}</div>}
    </div>
  );
}
