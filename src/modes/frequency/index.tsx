/**
 * Frequency mode — exact test frequencies: steady tone, sweep, or a list of
 * frequency steps; hold-to-test audition, note converter and saved frequencies.
 */
import type { GlideCurve } from '../../audio/types';
import { Button, NumberField, Panel, SegmentedControl, Slider, type SegmentOption } from '../../components/ui';
import { defineMode, type ModePanelProps } from '../../studio/types';
import { FREQ_MAX, FREQ_MIN, buildFrequency, defaultFrequencyParams, normalizeFrequencyParams, type FrequencyParams, type FrequencySubMode } from './build';
import { BigReadout, FreqControl, HoldButton, formatHz } from './controls';
import { Converter } from './Converter';
import { FrequencyPresets } from './FrequencyPresets';
import { StepList } from './StepList';
import './frequency.css';

export type { FrequencyParams, FrequencyStep, FrequencySubMode, FrequencySweep } from './build';

const QUICK = [50, 60, 100, 120, 220, 440, 880, 1000];

const SUB_MODES: readonly SegmentOption<FrequencySubMode>[] = [
  { value: 'steady', label: 'Steady tone', title: 'Continuous tone at the set frequency' },
  { value: 'sweep', label: 'Sweep', title: 'Glide from one frequency to another' },
  { value: 'sequence', label: 'Sequence', title: 'Play a list of frequency steps in order' },
];

const CURVES: readonly SegmentOption<GlideCurve>[] = [
  { value: 'linear', label: 'Linear', title: 'Constant Hz per second' },
  { value: 'exponential', label: 'Exponential', title: 'Constant musical speed (octaves per second)' },
  { value: 'logarithmic', label: 'Logarithmic', title: 'Fast at the start, slow at the end' },
];

function FrequencyPanel({ params, setParams }: ModePanelProps<FrequencyParams>) {
  const set = <K extends keyof FrequencyParams>(key: K, value: FrequencyParams[K]) => setParams((p) => ({ ...p, [key]: value }));
  const setSweep = (patch: Partial<FrequencyParams['sweep']>) => setParams((p) => ({ ...p, sweep: { ...p.sweep, ...patch } }));
  const { sliderMin: lo, sliderMax: hi } = params;

  return (
    <div className="mode-frequency">
      <div className="mode-frequency__top">
        <BigReadout frequency={params.frequency} />
        <div className="mode-frequency__top-controls">
          <div className="mode-frequency__hold">
            <HoldButton variant="primary" size="lg" frequency={params.frequency} gain={params.gain} title="Sounds while pressed (mouse, touch, Enter/Space)">
              Hold to test {formatHz(params.frequency)} Hz
            </HoldButton>
          </div>
          <div className="mode-frequency__quick" role="group" aria-label="Quick frequencies">
            {QUICK.map((f) => (
              <Button key={f} size="sm" pressed={params.frequency === f} onClick={() => set('frequency', f)}>
                {f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <FreqControl label="Frequency" value={params.frequency} onChange={(f) => set('frequency', f)} min={lo} max={hi} />

      <div className="mode-frequency__row">
        <Slider label="Level" value={Math.round(params.gain * 100)} min={0} max={100} step={1} unit="%" onChange={(g) => set('gain', g / 100)} />
        <div className="mode-frequency__bounds">
          <NumberField
            label="Slider min"
            value={lo}
            min={FREQ_MIN}
            max={FREQ_MAX / 2}
            step={1}
            precision={0}
            unit="Hz"
            onChange={(v) => setParams((p) => ({ ...p, sliderMin: v, sliderMax: Math.max(p.sliderMax, Math.min(FREQ_MAX, v * 2)) }))}
          />
          <NumberField
            label="Slider max"
            value={hi}
            min={FREQ_MIN * 2}
            max={FREQ_MAX}
            step={1}
            precision={0}
            unit="Hz"
            onChange={(v) => setParams((p) => ({ ...p, sliderMax: v, sliderMin: Math.min(p.sliderMin, v / 2) }))}
          />
        </div>
      </div>

      <Panel
        title="Playback"
        actions={<SegmentedControl aria-label="Frequency sub-mode" value={params.subMode} options={SUB_MODES} onChange={(v) => set('subMode', v)} />}
        className="mode-frequency__play"
      >
        {params.subMode === 'steady' && (
          <p className="mode-frequency__tip">
            PLAY sends a continuous {formatHz(params.frequency)} Hz tone (seamless loop, exportable). Changes apply instantly while playing.
          </p>
        )}
        {params.subMode === 'sweep' && (
          <div className="mode-frequency__sweep">
            <FreqControl label="From" value={params.sweep.from} onChange={(from) => setSweep({ from })} min={lo} max={hi} />
            <FreqControl label="To" value={params.sweep.to} onChange={(to) => setSweep({ to })} min={lo} max={hi} />
            <div className="mode-frequency__row">
              <Slider label="Sweep time" value={params.sweep.duration} min={0.1} max={120} step={0.1} scale="log" precision={1} unit="s" onChange={(duration) => setSweep({ duration })} />
              <div className="ui-field">
                <span className="ui-field__label">Curve</span>
                <SegmentedControl aria-label="Sweep curve" value={params.sweep.curve} options={CURVES} onChange={(curve) => setSweep({ curve })} />
              </div>
            </div>
            <div className="mode-frequency__sweep-actions">
              <Button size="sm" onClick={() => setSweep({ from: params.sweep.to, to: params.sweep.from })}>
                ⇄ Swap
              </Button>
              <Button size="sm" onClick={() => setSweep({ from: params.frequency })} title="Use the main frequency as the start">
                From = {formatHz(params.frequency)} Hz
              </Button>
              <Button size="sm" onClick={() => setSweep({ to: params.frequency })} title="Use the main frequency as the end">
                To = {formatHz(params.frequency)} Hz
              </Button>
              <span className="mode-frequency__tip">With LOOP on, the sweep restarts from “From”.</span>
            </div>
          </div>
        )}
        {params.subMode === 'sequence' && <StepList steps={params.steps} gain={params.gain} frequency={params.frequency} onChange={(steps) => set('steps', steps)} />}
      </Panel>

      <div className="mode-frequency__bottom">
        <Converter frequency={params.frequency} onApply={(f) => set('frequency', f)} />
        <FrequencyPresets params={params} />
      </div>
    </div>
  );
}

export const mode = defineMode<FrequencyParams>({
  id: 'frequency',
  label: 'Frequency',
  description: 'Exact test frequencies: steady tone, sweep or a frequency sequence, with note converter.',
  defaultParams: defaultFrequencyParams,
  normalizeParams: normalizeFrequencyParams,
  build: buildFrequency,
  liveUpdate: 'immediate',
  Panel: FrequencyPanel,
});
