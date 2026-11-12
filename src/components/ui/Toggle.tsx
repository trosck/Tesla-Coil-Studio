import type { ReactNode } from 'react';
import './ui.css';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Accessible on/off switch (role="switch"). */
export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={['ui-toggle', className].filter(Boolean).join(' ')}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-toggle__track" aria-hidden="true">
        <span className="ui-toggle__thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}
