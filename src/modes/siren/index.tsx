/**
 * Siren mode: continuous legato sweeps between two frequencies (wail, yelp,
 * wobble). Sound is compiled by the pure `buildSirenSequence` (build.ts).
 */
import { useMemo } from 'react';
import { freqToNearestNote } from '../../audio/music';
import { Button, Panel, SegmentedControl, Slider } from '../../components/ui';
import { defineMode, type ModePanelProps } from '../../studio/types';
import { CurvePreview } from '../ramp/CurvePreview';
import {
  SIREN_CYCLES_MAX,
  SIREN_CYCLE_MAX,
  SIREN_CYCLE_MIN,
  buildSirenSequence,
  defaultSirenParams,
  normalizeSirenParams,
  type SirenCurve,
  type SirenDirection,
  type SirenParams,
  type SirenWaveform,
} from './build';
import './siren.css';

export type { SirenParams } from './build';

function noteHint(f: number): string | undefined {
  const n = freqToNearestNote(f);
  return n ? `≈ ${n.name} (${n.cents >= 0 ? '+' : ''}${n.cents.toFixed(0)}¢)` : undefined;
}

const SPEEDS: { label: string; seconds: number }[] = [
  { label: 'Slow wail', seconds: 6 },
  { label: 'Wail', seconds: 2 },
  { label: 'Yelp', seconds: 0.35 },
  { label: 'Wobble', seconds: 0.12 },
];

const DIRECTION_OPTIONS: { value: SirenDirection; label: string; title: string }[] = [
  { value: 'alternate', label: '↗↘ Up / down', title: 'Rise then fall, continuously' },
  { value: 'rise', label: '↗ Rising', title: 'Rise, then jump back to the bottom' },
  { value: 'fall', label: '↘ Falling', title: 'Fall, then jump back to the top' },
];

const CURVE_OPTIONS: { value: SirenCurve; label: string; title: string }[] = [
  { value: 'smooth', label: 'Smooth', title: 'Sine-like: slows down at the turnarounds' },
  { value: 'linear', label: 'Linear', title: 'Constant Hz per second (triangle in Hz)' },
  { value: 'exponential', label: 'Exponential', title: 'Constant pitch speed' },
  { value: 'logarithmic', label: 'Logarithmic', title: 'Fast at the start of each sweep, slow at the end' },
];

const WAVE_OPTIONS: { value: SirenWaveform; label: string; title?: string }[] = [
  { value: 'global', label: 'Global', title: 'Use the transport waveform and duty' },
  { value: 'square', label: 'Square', title: 'Square (global duty)' },
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Saw', title: 'Sawtooth' },
];

function SirenPanel({ params, setParams }: ModePanelProps<SirenParams>) {
  const p = params;
  const set = <K extends keyof SirenParams>(key: K, value: SirenParams[K]) => setParams((prev) => ({ ...prev, [key]: value }));
  const sequence = useMemo(() => buildSirenSequence(p), [p]);
  const rate = 1 / p.cycleSeconds;
  const swapped = p.minFreq > p.maxFreq;

  return (
    <div className="mode-siren">
      <Panel
        title="Sweep"
        actions={
          <span className="mode-siren__readout lcd-chip">
            {rate >= 1 ? rate.toFixed(2) : rate.toFixed(3)} cycles/s · {sequence.length.toFixed(1)} s / pass
          </span>
        }
      >
        <CurvePreview sequence={sequence} modeId="siren" label={`Siren between ${Math.round(p.minFreq)} Hz and ${Math.round(p.maxFreq)} Hz, ${p.cycles} cycles`} />
      </Panel>

      <div className="mode-siren__grid">
        <Panel title="Range">
          <div className="mode-siren__stack">
            <Slider label="Min frequency" value={p.minFreq} min={20} max={20000} step={1} scale="log" unit="Hz" onChange={(v) => set('minFreq', v)} hint={noteHint(p.minFreq)} />
            <Slider
              label="Max frequency"
              value={p.maxFreq}
              min={20}
              max={20000}
              step={1}
              scale="log"
              unit="Hz"
              onChange={(v) => set('maxFreq', v)}
              hint={swapped ? 'Min is above max — the range is used the other way round' : noteHint(p.maxFreq)}
            />
          </div>
        </Panel>

        <Panel title="Speed">
          <div className="mode-siren__stack">
            <Slider
              label="Time per cycle"
              value={p.cycleSeconds}
              min={SIREN_CYCLE_MIN}
              max={SIREN_CYCLE_MAX}
              step={0.01}
              precision={2}
              scale="log"
              unit="s"
              onChange={(v) => set('cycleSeconds', v)}
              hint={`${rate.toFixed(2)} cycles per second${p.direction === 'alternate' ? ' (up + down)' : ''}`}
            />
            <div className="mode-siren__quick" role="group" aria-label="Speed presets">
              {SPEEDS.map((s) => (
                <Button key={s.label} size="sm" pressed={p.cycleSeconds === s.seconds} onClick={() => set('cycleSeconds', s.seconds)}>
                  {s.label}
                </Button>
              ))}
            </div>
            <Slider
              label="Cycles per pass"
              value={p.cycles}
              min={1}
              max={SIREN_CYCLES_MAX}
              step={1}
              onChange={(v) => set('cycles', v)}
              hint={`LOOP off: ${p.cycles} cycle${p.cycles === 1 ? '' : 's'} then stop. LOOP on: continuous.`}
            />
          </div>
        </Panel>

        <Panel title="Shape">
          <div className="mode-siren__stack">
            <div className="ui-field">
              <span className="ui-field__label">Direction</span>
              <SegmentedControl aria-label="Direction" value={p.direction} options={DIRECTION_OPTIONS} onChange={(v) => set('direction', v)} />
            </div>
            <div className="ui-field">
              <span className="ui-field__label">Curve</span>
              <SegmentedControl aria-label="Curve" value={p.curve} options={CURVE_OPTIONS} onChange={(v) => set('curve', v)} />
            </div>
          </div>
        </Panel>

        <Panel title="Tone">
          <div className="mode-siren__stack">
            <div className="ui-field">
              <span className="ui-field__label">Waveform</span>
              <SegmentedControl aria-label="Waveform" value={p.waveform} options={WAVE_OPTIONS} onChange={(v) => set('waveform', v)} />
              <div className="ui-field__hint">{p.waveform === 'global' ? 'Follows the transport waveform' : 'Overrides the transport waveform for this mode'}</div>
            </div>
            <Slider label="Level" value={Math.round(p.gain * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set('gain', v / 100)} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export const mode = defineMode<SirenParams>({
  id: 'siren',
  label: 'Siren',
  description: 'Smooth, continuous sweeps between two frequencies — wail, yelp or wobble.',
  defaultParams: defaultSirenParams,
  normalizeParams: normalizeSirenParams,
  build: buildSirenSequence,
  liveUpdate: 'boundary',
  Panel: SirenPanel,
});
