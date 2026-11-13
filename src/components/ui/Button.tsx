import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ui.css';

/**
 * secondary = silver gel, primary = blue gel, play = green gel,
 * danger = red gel, ghost = flat XP toolbar button.
 */
export type ButtonVariant = 'secondary' | 'primary' | 'play' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  /** Toggle buttons: sets aria-pressed and the "on" style. */
  pressed?: boolean;
}

const LOOK: Record<ButtonVariant, string> = {
  secondary: 'gel gel-silver',
  primary: 'gel gel-blue',
  play: 'gel gel-green',
  danger: 'gel gel-red',
  ghost: 'flat',
};

export function Button({ variant = 'secondary', size = 'md', icon, pressed, className, children, type = 'button', ...rest }: ButtonProps) {
  const cls = ['ui-btn', `ui-btn--${variant}`, LOOK[variant], size !== 'md' && `ui-btn--${size}`, className].filter(Boolean).join(' ');
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
