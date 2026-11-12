import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ui.css';

export type ButtonVariant = 'secondary' | 'primary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  /** Toggle buttons: sets aria-pressed and the "on" style. */
  pressed?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, pressed, className, children, type = 'button', ...rest }: ButtonProps) {
  const cls = ['ui-btn', `ui-btn--${variant}`, size !== 'md' && `ui-btn--${size}`, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} aria-pressed={pressed} {...rest}>
      {icon && (
        <span className="ui-btn__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
