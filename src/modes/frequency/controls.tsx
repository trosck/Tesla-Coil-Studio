import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { freqToNearestNote } from '../../audio/music';
import { Button, Field, NumberInput, type ButtonProps } from '../../components/ui';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { FREQ_MAX, FREQ_MIN, freqToSliderPos, roundFreq, sliderPosToFreq } from './build';

const RES = 1000;

export function formatHz(f: number): string {
  if (f >= 1000) return f.toFixed(1);
  return f.toFixed(2);
}

export function noteLabel(f: number): string {
  const n = freqToNearestNote(f);
  if (!n) return '—';
  const c = Math.round(n.cents);
  return `${n.name} ${c >= 0 ? '+' : ''}${c}¢`;
}

/**
 * Frequency control: logarithmic slider over [min, max] plus an exact numeric
 * entry that accepts the full 1–20000 Hz range (independent of the slider bounds).
 */
export function FreqControl({ label, value, onChange, min, max, aside }: { label: string; value: number; onChange: (f: number) => void; min: number; max: number; aside?: ReactNode }) {
  const id = useId();
  const pos = Math.round(freqToSliderPos(value, min, max) * RES);
  const outside = value < min || value > max;
  return (
    <Field
      label={label}
      htmlFor={id}
      aside={aside}
      hint={
        <>
          Nearest note <span className="mode-frequency__mono">{noteLabel(value)}</span>
          {outside && <span className="mode-frequency__warn"> · outside slider range</span>}
        </>
      }
    >
      <div className="mode-frequency__freq-row">
        <input
          className="ui-range"
          type="range"
          min={0}
          max={RES}
          step={1}
          value={pos}
          style={{ '--pct': `${(pos / RES) * 100}%` } as CSSProperties}
          aria-label={`${label} slider (logarithmic)`}
          aria-valuetext={`${formatHz(value)} Hz`}
          onChange={(e) => onChange(roundFreq(sliderPosToFreq(Number(e.target.value) / RES, min, max)))}
        />
        <NumberInput id={id} value={value} onChange={onChange} min={FREQ_MIN} max={FREQ_MAX} step={0.01} precision={2} unit="Hz" className="mode-frequency__hz-input" />
      </div>
    </Field>
  );
}

/** Press-and-hold audition via engine.noteOn/noteOff (mouse, touch, Enter/Space). */
export function HoldButton({ frequency, gain, children, ...rest }: { frequency: number; gain: number; children: ReactNode } & Omit<ButtonProps, 'onPointerDown' | 'onKeyDown'>) {
  const { engine } = useStudio();
  const holding = useRef(false);
  const [active, setActive] = useState(false);

  const start = () => {
    holding.current = true;
    setActive(true);
    engine.noteOn(frequency, gain);
  };
  const end = () => {
    if (!holding.current) return;
    holding.current = false;
    setActive(false);
    engine.noteOff();
  };

  // Follow frequency / level changes while the button is held (e.g. multi-touch on a quick button).
  useEffect(() => {
    if (holding.current) engine.noteOn(frequency, gain);
  }, [engine, frequency, gain]);

  useEffect(() => {
    const h = holding;
    return () => {
      if (h.current) engine.noteOff();
    };
  }, [engine]);

  return (
    <Button
      {...rest}
      pressed={active}
      className={['mode-frequency__hold-btn', rest.className].filter(Boolean).join(' ')}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') end();
      }}
      onBlur={end}
    >
      {children}
    </Button>
  );
}

/** Large readout: the live output frequency while sounding, otherwise the entered one. */
export function BigReadout({ frequency }: { frequency: number }) {
  const live = usePlayback((s) => (s.amplitude > 0.001 && s.frequency > 0 ? Math.round(s.frequency * 100) / 100 : 0));
  const shown = live || frequency;
  const n = freqToNearestNote(shown);
  return (
    <div className={live ? 'mode-frequency__big is-live' : 'mode-frequency__big'} aria-live="off">
      <div className="mode-frequency__big-tag">{live ? 'Output' : 'Set'}</div>
      <div className="mode-frequency__big-value">
        {formatHz(shown)}
        <span className="mode-frequency__big-unit">Hz</span>
      </div>
      <div className="mode-frequency__big-note">
        {n ? (
          <>
            {n.name} <span>{`${n.cents >= 0 ? '+' : ''}${n.cents.toFixed(1)}¢`}</span> <span>MIDI {n.midi}</span>
          </>
        ) : (
          '—'
        )}
      </div>
    </div>
  );
}
