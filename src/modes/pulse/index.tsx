/**
 * Pulse mode: rhythmic on/off bursts at a fixed pitch on a BPM grid, with
 * built-in rhythm patterns and an editable 8/16-step custom pattern with
 * accents. Sound is compiled by the pure `buildPulsePlayable` (build.ts).
 */
import type { CSSProperties } from 'react';
import { freqToNearestNote } from '../../audio/music';
import { Button, Panel, SegmentedControl, Slider, Toggle } from '../../components/ui';
import { usePlayback, useStudio } from '../../studio/StudioContext';
import { defineMode, type ModePanelProps } from '../../studio/types';
import {
  PULSE_BPM_MAX,
  PULSE_BPM_MIN,
  PULSE_BPM_PRESETS,
  PULSE_MS_MAX,
  PULSE_MS_MIN,
  PULSE_PATTERNS,
  PULSE_PAUSE_MAX,
  PULSE_REPS_MAX,
  buildPulsePlayable,
  defaultPulseParams,
  normalizePulseParams,
  pulseTiming,
  resolvePattern,
  type PulseParams,
  type PulsePatternId,
  type PulseStep,
} from './build';
import './pulse.css';

export type { PulseParams } from './build';

const QUICK_FREQS = [55, 110, 220, 440, 880];

function useCurrentStep(): number | null {
  const { sourceModeId } = useStudio();
  const playing = usePlayback((s) => s.isPlaying && !s.isPaused);
  const step = usePlayback((s) => s.step);
  return playing && sourceModeId === 'pulse' && typeof step === 'number' ? step : null;
}

function PatternStrip({ steps, editable, onToggle }: { steps: readonly PulseStep[]; editable: boolean; onToggle: (i: number) => void }) {
  const current = useCurrentStep();
  const cols = steps.length <= 8 ? 8 : 16;
  const perBeat = steps.length <= 8 ? 2 : 4;
  return (
    <div
      className={['mode-pulse__strip', `mode-pulse__strip--c${cols}`, editable && 'mode-pulse__strip--edit'].filter(Boolean).join(' ')}
      style={{ '--cols': cols } as CSSProperties}
      role={editable ? 'group' : 'img'}
      aria-label={editable ? 'Custom pattern editor: click a step to cycle off, pulse, accent' : `Pattern: ${steps.map((v) => (v === 2 ? 'X' : v === 1 ? 'x' : '.')).join('')}`}
    >
      {steps.map((v, i) => {
        const cls = [
          'mode-pulse__cell',
          v === 1 && 'mode-pulse__cell--on',
          v === 2 && 'mode-pulse__cell--accent',
          i % perBeat === 0 && 'mode-pulse__cell--beat',
          current === i && 'mode-pulse__cell--now',
        ]
          .filter(Boolean)
          .join(' ');
        if (!editable) return <span key={i} className={cls} />;
        return (
          <button
            key={i}
            type="button"
            className={cls}
            aria-label={`Step ${i + 1}: ${v === 2 ? 'accent' : v === 1 ? 'pulse' : 'off'}`}
            onClick={() => onToggle(i)}
          />
        );
      })}
    </div>
  );
}

function PulsePanel({ params, setParams }: ModePanelProps<PulseParams>) {
  const p = params;
  const set = <K extends keyof PulseParams>(key: K, value: PulseParams[K]) => setParams((prev) => ({ ...prev, [key]: value }));
  const pattern = resolvePattern(p);
  const timing = pulseTiming(p);
  const note = freqToNearestNote(p.frequency);
  const isCustom = p.pattern === 'custom';
  const continuous = p.repetitions === 0;
  const empty = !pattern.steps.some((v) => v > 0);

  const toggleStep = (i: number) =>
    setParams((prev) => {
      const custom = [...prev.custom];
      custom[i] = (((custom[i] ?? 0) + 1) % 3) as PulseStep;
      return { ...prev, custom };
    });

  const editAsCustom = () =>
    setParams((prev) => {
      const src = resolvePattern(prev).steps;
      const custom = Array.from({ length: 16 }, (_, i) => (src[i] ?? 0) as PulseStep);
      return { ...prev, pattern: 'custom', customSteps: 16, custom };
    });

  return (
    <div className="mode-pulse">
      <Panel
        title="Rhythm"
        actions={
          <span className="mode-pulse__readout">
            {Math.round(p.bpm)} BPM · {(timing.step * 1000).toFixed(0)} ms/step
          </span>
        }
      >
        <div className="mode-pulse__stack">
          <div className="mode-pulse__patterns" role="group" aria-label="Rhythm pattern">
            {PULSE_PATTERNS.map((pt) => (
              <Button key={pt.id} size="sm" pressed={p.pattern === pt.id} onClick={() => set('pattern', pt.id as PulsePatternId)}>
                {pt.label}
              </Button>
            ))}
            <Button size="sm" pressed={isCustom} onClick={() => set('pattern', 'custom')}>
              Custom
            </Button>
          </div>
          <PatternStrip steps={pattern.steps} editable={isCustom} onToggle={toggleStep} />
          {isCustom ? (
            <div className="mode-pulse__row">
              <SegmentedControl
                aria-label="Custom pattern length"
                value={String(p.customSteps) as '8' | '16'}
                options={[
                  { value: '8', label: '8 steps (8ths)' },
                  { value: '16', label: '16 steps (16ths)' },
                ]}
                onChange={(v) => set('customSteps', v === '8' ? 8 : 16)}
              />
              <Button size="sm" variant="ghost" onClick={() => set('custom', Array.from({ length: 16 }, () => 0 as PulseStep))}>
                Clear
              </Button>
              <span className="mode-pulse__tip">Tap a step: off → pulse → accent</span>
            </div>
          ) : (
            <div className="mode-pulse__row">
              <Button size="sm" variant="ghost" onClick={editAsCustom}>
                Edit as custom
              </Button>
              <span className="mode-pulse__tip">Bright cells = accents</span>
            </div>
          )}
          {empty && <p className="mode-pulse__warn">The pattern is empty — add at least one step to play.</p>}
          <p className="mode-pulse__rule">
            BPM sets the grid ({pattern.stepsPerBeat === 2 ? '8th' : '16th'}-note steps, {pattern.steps.length} per pattern). Pulse duration is the gate inside each step. Pause adds silence after each pattern.
          </p>
        </div>
      </Panel>

      <div className="mode-pulse__grid">
        <Panel title="Tempo">
          <div className="mode-pulse__stack">
            <Slider label="BPM" value={p.bpm} min={PULSE_BPM_MIN} max={PULSE_BPM_MAX} step={1} onChange={(v) => set('bpm', v)} />
            <div className="mode-pulse__quick" role="group" aria-label="BPM presets">
              {PULSE_BPM_PRESETS.map((b) => (
                <Button key={b} size="sm" pressed={p.bpm === b} onClick={() => set('bpm', b)}>
                  {b}
                </Button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Pulse">
          <div className="mode-pulse__stack">
            <Slider
              label="Pulse frequency"
              value={p.frequency}
              min={20}
              max={20000}
              step={0.1}
              precision={1}
              scale="log"
              unit="Hz"
              onChange={(v) => set('frequency', v)}
              hint={note ? `Note ${note.name} (${note.cents >= 0 ? '+' : ''}${note.cents.toFixed(0)}¢)` : undefined}
            />
            <div className="mode-pulse__quick" role="group" aria-label="Quick frequencies">
              {QUICK_FREQS.map((f) => (
                <Button key={f} size="sm" pressed={p.frequency === f} onClick={() => set('frequency', f)}>
                  {f} Hz
                </Button>
              ))}
            </div>
            <Slider
              label="Pulse duration (gate)"
              value={p.pulseMs}
              min={PULSE_MS_MIN}
              max={PULSE_MS_MAX}
              step={1}
              scale="log"
              unit="ms"
              onChange={(v) => set('pulseMs', v)}
              hint={
                timing.gateLimited
                  ? `Limited to ${(timing.gate * 1000).toFixed(0)} ms (90% of a step) at this tempo`
                  : `${Math.round((timing.gate / timing.step) * 100)}% of a step`
              }
            />
          </div>
        </Panel>

        <Panel title="Dynamics">
          <div className="mode-pulse__stack">
            <Slider
              label="Accent"
              value={Math.round(p.accent * 100)}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(v) => set('accent', v / 100)}
              hint="How much quieter normal pulses are than accents"
            />
            <Slider label="Level" value={Math.round(p.gain * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set('gain', v / 100)} />
          </div>
        </Panel>

        <Panel title="Pause & repeat">
          <div className="mode-pulse__stack">
            <Slider
              label="Pause after each pattern"
              value={p.pauseSeconds}
              min={0}
              max={PULSE_PAUSE_MAX}
              step={0.05}
              precision={2}
              unit="s"
              onChange={(v) => set('pauseSeconds', v)}
            />
            <Toggle checked={continuous} onChange={(on) => set('repetitions', on ? 0 : 4)} label="Continuous (∞)" />
            <Slider
              label="Repetitions"
              value={continuous ? 1 : p.repetitions}
              min={1}
              max={PULSE_REPS_MAX}
              step={1}
              disabled={continuous}
              onChange={(v) => set('repetitions', v)}
              hint={
                continuous
                  ? 'Plays until STOP'
                  : `LOOP off: ${p.repetitions} pattern${p.repetitions === 1 ? '' : 's'} then stop (${(p.repetitions * timing.repetition).toFixed(1)} s). LOOP on: repeats.`
              }
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export const mode = defineMode<PulseParams>({
  id: 'pulse',
  label: 'Pulse',
  description: 'Rhythmic on/off bursts at a fixed pitch — the classic Tesla coil buzz.',
  defaultParams: defaultPulseParams,
  normalizeParams: normalizePulseParams,
  build: buildPulsePlayable,
  liveUpdate: 'boundary',
  Panel: PulsePanel,
});
