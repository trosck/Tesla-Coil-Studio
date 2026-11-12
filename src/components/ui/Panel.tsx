import type { HTMLAttributes, ReactNode } from 'react';
import './ui.css';

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
}

export function Panel({ title, actions, className, children, ...rest }: PanelProps) {
  return (
    <section className={['ui-panel', className].filter(Boolean).join(' ')} {...rest}>
      {(title || actions) && (
        <header className="ui-panel__head">
          {title && <h2 className="ui-panel__title">{title}</h2>}
          {actions && <div className="ui-panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
