import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import './ui.css';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Small badge, e.g. "recommended". */
  badge?: string;
  title?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (v: T) => void;
  'aria-label': string;
  className?: string;
}

/** Radio group styled as segments. Arrow keys move the selection. */
export function SegmentedControl<T extends string>({ value, options, onChange, className, ...aria }: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length]!;
    onChange(next.value);
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[options.indexOf(next)]?.focus();
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={aria['aria-label']} className={['ui-seg', className].filter(Boolean).join(' ')} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            className="ui-seg__opt"
            onClick={() => onChange(o.value)}
          >
            {o.label}
            {o.badge && <span className="ui-seg__badge">{o.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
