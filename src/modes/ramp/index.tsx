/**
 * Ramp mode: a frequency glide between two frequencies with a selectable
 * acceleration curve, optional up-down, stepped segments, pauses and repeats.
 * The sound is compiled by the pure `buildRampSequence` (build.ts).
 */
import { useMemo } from 'react';
import { freqToNearestNote } from '../../audio/music';
import type { GlideCurve } from '../../audio/types';
import { Button, Panel, SegmentedControl, Slider, Toggle } from '../../components/ui';
import { defineMode, type ModePanelProps } from '../../studio/types';
import {
  RAMP_DURATION_MAX,
  RAMP_DURATION_MIN,
  RAMP_GAP_MAX,
  RAMP_PAUSE_MAX,
  RAMP_REPEATS_MAX,
  RAMP_STEPS_MAX,
  buildRampSequence,
  defaultRampParams,
  normalizeRampParams,
  rampRepetitionSeconds,
  type RampParams,
  type RampStepStyle,
} from './build';
import { CurvePreview } from './CurvePreview';
import './ramp.css';

export type { RampParams } from './build';

function noteHint(f: number): string | undefined {
  const n = freqToNearestNote(f);
  return n ? `≈ ${n.name} (${n.cents >= 0 ? '+' : ''}${n.cents.toFixed(0)}¢)` : undefined;
}

const CURVE_OPTIONS: { value: GlideCurve; label: string; title: string }[] = [
  { value: 'linear', label: 'Linear', title: 'Constant Hz per second' },
  { value: 'exponential', label: 'Exponential', title: 'Constant musical pitch speed (octaves per second)' },
  { value: 'logarithmic', label: 'Logarithmic', title: 'Fast at the start, slowing down towards the end' },
];

const STYLE_OPTIONS: { value: RampStepStyle; label: string; title: string }[] = [
  { value: 'hold', label: 'Staircase', title: 'Each segment holds one steady pitch' },
  { value: 'glide', label: 'Chopped glide', title: 'Each segment glides along its part of the curve' },
];

function RampPanel({ params, setParams }: ModePanelProps<RampParams>) {
  const p = params;
  const set = <K extends keyof RampParams>(key: K, value: RampParams[K]) => setParams((prev) => ({ ...prev, [key]: value }));
  const sequence = useMemo(() => buildRampSequence(p), [p]);
  const rep = rampRepetitionSeconds(p);
  const octaves = Math.log2(Math.max(p.startFreq, p.endFreq) / Math.min(p.startFreq, p.endFreq));
  const stepped = p.steps > 1;

  return (
    <div className="mode-ramp">
      <Panel
        title="Trajectory"
        className="mode-ramp__preview"
        actions={
          <span className="mode-ramp__readout lcd-chip">
            {p.startFreq < p.endFreq ? '↗' : p.startFreq > p.endFreq ? '↘' : '→'} {octaves.toFixed(2)} oct · {rep.toFixed(2)} s / ramp
          </span>
        }
      >
        <CurvePreview
          sequence={sequence}
          modeId="ramp"
          label={`Ramp from ${Math.round(p.startFreq)} Hz to ${Math.round(p.endFreq)} Hz over ${p.duration} seconds`}
        />
      </Panel>

      <div className="mode-ramp__grid">
        <Panel
          title="Range"
          actions={
            <Button size="sm" title="Swap start and end" onClick={() => setParams((prev) => ({ ...prev, startFreq: prev.endFreq, endFreq: prev.startFreq }))}>
              ⇅ Swap
            </Button>
          }
        >
          <div className="mode-ramp__stack">
            <Slider label="Start frequency" value={p.startFreq} min={20} max={20000} step={1} scale="log" unit="Hz" onChange={(v) => set('startFreq', v)} hint={noteHint(p.startFreq)} />
            <Slider label="End frequency" value={p.endFreq} min={20} max={20000} step={1} scale="log" unit="Hz" onChange={(v) => set('endFreq', v)} hint={noteHint(p.endFreq)} />
          </div>
        </Panel>

        <Panel title="Shape">
          <div className="mode-ramp__stack">
            <Slider
              label="Ramp duration"
              value={p.duration}
              min={RAMP_DURATION_MIN}
              max={RAMP_DURATION_MAX}
              step={0.01}
              precision={2}
              scale="log"
              unit="s"
              onChange={(v) => set('duration', v)}
              hint={p.upDown ? 'Per direction — the return leg takes the same time' : undefined}
            />
            <div className="ui-field">
              <span className="ui-field__label">Acceleration curve</span>
              <SegmentedControl aria-label="Acceleration curve" value={p.curve} options={CURVE_OPTIONS} onChange={(v) => set('curve', v)} />
            </div>
            <Toggle checked={p.upDown} onChange={(v) => set('upDown', v)} label="Ramp back down (up-down)" />
          </div>
        </Panel>

        <Panel title="Steps & pauses">
          <div className="mode-ramp__stack">
            <Slider
              label="Segments"
              value={p.steps}
              min={1}
              max={RAMP_STEPS_MAX}
              step={1}
              onChange={(v) => set('steps', v)}
              hint={stepped ? `${p.steps} segments of ${((p.duration / p.steps) * 1000).toFixed(0)} ms` : '1 = smooth continuous ramp'}
            />
            {stepped && (
              <>
                <div className="ui-field">
                  <span className="ui-field__label">Segment style</span>
                  <SegmentedControl aria-label="Segment style" value={p.stepStyle} options={STYLE_OPTIONS} onChange={(v) => set('stepStyle', v)} />
                </div>
                <Slider
                  label="Gap between segments"
                  value={Math.round(p.stepGap * 1000)}
                  min={0}
                  max={RAMP_GAP_MAX * 1000}
                  step={1}
                  unit="ms"
                  onChange={(v) => set('stepGap', v / 1000)}
                  hint={p.stepGap > p.duration / p.steps / 2 ? 'Limited to half a segment' : undefined}
                />
              </>
            )}
            <Slider label="Pause before ramp" value={p.pauseBefore} min={0} max={RAMP_PAUSE_MAX} step={0.05} precision={2} unit="s" onChange={(v) => set('pauseBefore', v)} />
            <Slider label="Pause after ramp" value={p.pauseAfter} min={0} max={RAMP_PAUSE_MAX} step={0.05} precision={2} unit="s" onChange={(v) => set('pauseAfter', v)} />
          </div>
        </Panel>

        <Panel title="Repeat & level">
          <div className="mode-ramp__stack">
            <Slider
              label="Ramps per pass"
              value={p.repeats}
              min={1}
              max={RAMP_REPEATS_MAX}
              step={1}
              onChange={(v) => set('repeats', v)}
              hint={`LOOP off: plays ${p.repeats} ramp${p.repeats === 1 ? '' : 's'} then stops (${sequence.length.toFixed(1)} s). LOOP on: repeats forever.`}
            />
            <Slider label="Level" value={Math.round(p.gain * 100)} min={0} max={100} step={1} unit="%" onChange={(v) => set('gain', v / 100)} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export const mode = defineMode<RampParams>({
  id: 'ramp',
  label: 'Ramp',
  description: 'Linear / exponential / logarithmic frequency ramps between two frequencies.',
  defaultParams: defaultRampParams,
  normalizeParams: normalizeRampParams,
  build: buildRampSequence,
  liveUpdate: 'boundary',
  Panel: RampPanel,
});
