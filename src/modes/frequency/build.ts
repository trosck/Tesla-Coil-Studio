import type { GlideCurve, Sequence, ToneEvent } from '../../audio/types';

export type FrequencySubMode = 'steady' | 'sweep' | 'sequence';

export interface FrequencySweep {
  /** Hz */
  from: number;
  /** Hz */
  to: number;
  /** Seconds */
  duration: number;
  curve: GlideCurve;
}

export interface FrequencyStep {
  /** Stable row id (React key). */
  id: string;
  /** Hz */
  frequency: number;
  /** Seconds the tone sounds. */
  duration: number;
  /** Seconds of silence after the tone (0 = legato into the next step). */
  gap: number;
}

export interface FrequencyParams {
  /** Hz — the steady tone, also used by "Hold to test". */
  frequency: number;
  /** 0..1 */
  gain: number;
  subMode: FrequencySubMode;
  /** Bounds of the logarithmic frequency sliders (Hz). */
  sliderMin: number;
  sliderMax: number;
  sweep: FrequencySweep;
  steps: FrequencyStep[];
}

export const FREQ_MIN = 1;
export const FREQ_MAX = 20000;
export const DURATION_MIN = 0.01;
export const DURATION_MAX = 600;
export const GAP_MAX = 60;
export const MAX_STEPS = 128;
const CURVES: readonly GlideCurve[] = ['linear', 'exponential', 'logarithmic'];
const SUB_MODES: readonly FrequencySubMode[] = ['steady', 'sweep', 'sequence'];

export const defaultFrequencyParams: FrequencyParams = {
  frequency: 440,
  gain: 0.8,
  subMode: 'steady',
  sliderMin: 20,
  sliderMax: 5000,
  sweep: { from: 100, to: 1000, duration: 5, curve: 'exponential' },
  steps: [
    { id: 's0', frequency: 220, duration: 0.5, gap: 0.1 },
    { id: 's1', frequency: 440, duration: 0.5, gap: 0.1 },
    { id: 's2', frequency: 880, duration: 0.5, gap: 0.1 },
    { id: 's3', frequency: 440, duration: 0.5, gap: 0.4 },
  ],
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const clampFreq = (v: unknown, d: number) => num(v, d, FREQ_MIN, FREQ_MAX);

function normalizeSteps(raw: unknown): FrequencyStep[] {
  if (!Array.isArray(raw)) return defaultFrequencyParams.steps.map((s) => ({ ...s }));
  const seen = new Set<string>();
  const out: FrequencyStep[] = [];
  for (const item of raw.slice(0, MAX_STEPS)) {
    if (!isObj(item) || typeof item.frequency !== 'number' || !Number.isFinite(item.frequency)) continue;
    let id = typeof item.id === 'string' && item.id ? item.id : `s${out.length}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    out.push({
      id,
      frequency: clampFreq(item.frequency, 440),
      duration: num(item.duration, 0.5, DURATION_MIN, DURATION_MAX),
      gap: num(item.gap, 0, 0, GAP_MAX),
    });
  }
  return out;
}

/** Validates stored / preset data. Old `{ frequency, gain }` params stay valid (steady tone). */
export function normalizeFrequencyParams(raw: unknown): FrequencyParams {
  const r = isObj(raw) ? raw : {};
  const d = defaultFrequencyParams;
  const sw = isObj(r.sweep) ? r.sweep : {};
  let sliderMin = clampFreq(r.sliderMin, d.sliderMin);
  let sliderMax = clampFreq(r.sliderMax, d.sliderMax);
  if (sliderMax <= sliderMin) {
    if (sliderMin >= FREQ_MAX) sliderMin = FREQ_MAX / 2;
    sliderMax = Math.min(FREQ_MAX, Math.max(sliderMin * 2, sliderMin + 1));
  }
  return {
    frequency: clampFreq(r.frequency, d.frequency),
    gain: num(r.gain, d.gain, 0, 1),
    subMode: SUB_MODES.includes(r.subMode as FrequencySubMode) ? (r.subMode as FrequencySubMode) : d.subMode,
    sliderMin,
    sliderMax,
    sweep: {
      from: clampFreq(sw.from, d.sweep.from),
      to: clampFreq(sw.to, d.sweep.to),
      duration: num(sw.duration, d.sweep.duration, DURATION_MIN, DURATION_MAX),
      curve: CURVES.includes(sw.curve as GlideCurve) ? (sw.curve as GlideCurve) : d.sweep.curve,
    },
    steps: normalizeSteps(r.steps),
  };
}

const hz = (f: number) => `${parseFloat(f.toFixed(2))}hz`;

/**
 * Steady test tone: one 1-second event filling a 1-second loop. Touching
 * events are rendered legato, so looping is seamless (no gaps).
 */
export function buildSteady(p: Pick<FrequencyParams, 'frequency' | 'gain'>): Sequence {
  return {
    events: [{ time: 0, duration: 1, freqStart: p.frequency, gain: p.gain }],
    length: 1,
    loop: true,
    label: `tone-${hz(p.frequency)}`,
  };
}

/** One glide from `from` to `to`; with loop ON it restarts at `from`. */
export function buildSweep(p: Pick<FrequencyParams, 'sweep' | 'gain'>): Sequence {
  const { from, to, duration, curve } = p.sweep;
  return {
    events: [{ time: 0, duration, freqStart: from, freqEnd: to, curve, gain: p.gain }],
    length: duration,
    loop: true,
    label: `sweep-${hz(from)}-${hz(to)}`,
  };
}

/** Steps in order; `step` = row index (for highlighting). Null when empty. */
export function buildStepSequence(p: Pick<FrequencyParams, 'steps' | 'gain'>): Sequence | null {
  if (p.steps.length === 0) return null;
  const events: ToneEvent[] = [];
  let t = 0;
  p.steps.forEach((s, i) => {
    events.push({ time: t, duration: s.duration, freqStart: s.frequency, gain: p.gain, step: i });
    t += s.duration + s.gap;
  });
  return { events, length: t, loop: true, label: `freq-sequence-${p.steps.length}` };
}

export function buildFrequency(p: FrequencyParams): Sequence | null {
  if (p.subMode === 'sweep') return buildSweep(p);
  if (p.subMode === 'sequence') return buildStepSequence(p);
  return buildSteady(p);
}

/** Log-slider mapping helpers (position 0..1 <-> Hz). */
export function freqToSliderPos(f: number, min: number, max: number): number {
  const c = Math.min(max, Math.max(min, f));
  return Math.log(c / min) / Math.log(max / min);
}
export function sliderPosToFreq(pos: number, min: number, max: number): number {
  return min * Math.pow(max / min, Math.min(1, Math.max(0, pos)));
}

/** Round a frequency for display/entry from a slider: ~4 significant digits. */
export function roundFreq(f: number): number {
  if (f >= 1000) return Math.round(f);
  if (f >= 100) return Math.round(f * 10) / 10;
  return Math.round(f * 100) / 100;
}
