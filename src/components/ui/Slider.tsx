import { useId, type CSSProperties } from 'react';
import { Field } from './Field';
import { NumberInput, clampNumber } from './NumberField';
import './ui.css';

export interface SliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  /** 'log' maps the track logarithmically (min must be > 0), good for frequency. */
  scale?: 'linear' | 'log';
  unit?: string;
  precision?: number;
  hint?: string;
  disabled?: boolean;
  /** Hide the numeric input (track only). */
  hideInput?: boolean;
  className?: string;
}

const RES = 1000;

function toPos(v: number, min: number, max: number, scale: 'linear' | 'log'): number {
  if (scale === 'log') return (Math.log(v / min) / Math.log(max / min)) * RES;
  return ((v - min) / (max - min)) * RES;
}

function fromPos(p: number, min: number, max: number, scale: 'linear' | 'log'): number {
  const u = p / RES;
  if (scale === 'log') return min * Math.pow(max / min, u);
  return min + (max - min) * u;
}

function snap(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/** Range slider + numeric input with unit. Fully keyboard accessible. */
export function Slider({ label, value, onChange, min, max, step = 1, scale = 'linear', unit, precision, hint, disabled, hideInput, className }: SliderProps) {
  const id = useId();
  const v = clampNumber(value, min, max);
  const pos = Math.round(toPos(v, min, max, scale));
  const style = { '--pct': `${(pos / RES) * 100}%` } as CSSProperties;
  const display = `${v.toFixed(precision ?? (step < 1 ? String(step).split('.')[1]?.length ?? 2 : 0))}${unit ? ` ${unit}` : ''}`;
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <div className="ui-slider" style={hideInput ? { gridTemplateColumns: '1fr' } : undefined}>
        <input
          id={id}
          className="ui-range"
          type="range"
          min={0}
          max={RES}
          step={1}
          value={pos}
          disabled={disabled}
          style={style}
          aria-valuetext={display}
          onChange={(e) => {
            const raw = fromPos(Number(e.target.value), min, max, scale);
            onChange(clampNumber(parseFloat(snap(raw, step).toFixed(10)), min, max));
          }}
        />
        {!hideInput && (
          <NumberInput value={v} onChange={onChange} min={min} max={max} step={step} precision={precision} unit={unit} disabled={disabled} aria-label={label} />
        )}
      </div>
    </Field>
  );
}
