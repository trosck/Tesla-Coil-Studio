/**
 * Pulse mode: pure params -> Playable compiler.
 *
 * Timing rule (shown in the UI):
 * - BPM defines the grid. Built-in patterns are one 4/4 bar of 16th-note
 *   steps (4 steps per beat); a custom 16-step pattern uses 16ths, a custom
 *   8-step pattern uses 8th notes (2 steps per beat) — always one bar.
 * - Pulse duration (ms) is the gate: how long the tone sounds inside each
 *   active step. It is limited to 90% of a step so consecutive pulses stay
 *   separate (touching events would merge legato).
 * - Pause adds extra silence after every repetition of the pattern.
 * - Repetitions: N > 0 = one pass holds N pattern repetitions (LOOP off stops
 *   after them; LOOP on repeats the pass). 0 = continuous (endless source,
 *   plays until STOP regardless of LOOP).
 */
import { stepSeconds } from '../../audio/music';
import type { Playable, Sequence, ToneEvent } from '../../audio/types';

export type PulsePatternId = 'quarters' | 'eighths' | 'sixteenths' | 'dotted' | 'gallop' | 'clave32' | 'heartbeat' | 'morse' | 'custom';

/** Step value: 0 = rest, 1 = pulse, 2 = accented pulse. */
export type PulseStep = 0 | 1 | 2;

export interface PulseParams {
  bpm: number;
  /** Hz */
  frequency: number;
  /** Gate length of each pulse in ms. */
  pulseMs: number;
  /** Extra silence after each pattern repetition, seconds. */
  pauseSeconds: number;
  /** Pattern repetitions per pass; 0 = continuous. */
  repetitions: number;
  pattern: PulsePatternId;
  /** 0..1: how much quieter non-accented pulses are (0 = all equal). */
  accent: number;
  /** 0..1 level of accented pulses. */
  gain: number;
  /** Custom pattern length. */
  customSteps: 8 | 16;
  /** Custom pattern, always 16 entries (only the first `customSteps` are used). */
  custom: PulseStep[];
}

export interface PulsePatternDef {
  id: Exclude<PulsePatternId, 'custom'>;
  label: string;
  /** 'X' accent, 'x' pulse, '.' rest; one char per 16th step. */
  steps: string;
}

export const PULSE_PATTERNS: readonly PulsePatternDef[] = [
  { id: 'quarters', label: 'Straight quarters', steps: 'X...x...x...x...' },
  { id: 'eighths', label: 'Eighths', steps: 'X.x.x.x.X.x.x.x.' },
  { id: 'sixteenths', label: 'Sixteenths', steps: 'Xxxxxxxxxxxxxxxx' },
  { id: 'dotted', label: 'Dotted eighths', steps: 'X..x..x..x..X...' },
  { id: 'gallop', label: 'Gallop', steps: 'X.xxX.xxX.xxX.xx' },
  { id: 'clave32', label: 'Clave 3-2', steps: 'X..x..X...x.X...' },
  { id: 'heartbeat', label: 'Heartbeat', steps: 'X..x............' },
  // S-O-S: dots = short pulses, dashes = accented (louder) pulses
  { id: 'morse', label: 'Morse accent (SOS)', steps: 'x.x.x...X.X.X...x.x.x...........' },
];

export const PULSE_BPM_PRESETS = [60, 90, 120, 140, 160, 180] as const;
export const PULSE_BPM_MIN = 20;
export const PULSE_BPM_MAX = 300;
export const PULSE_FREQ_MIN = 1;
export const PULSE_FREQ_MAX = 20000;
export const PULSE_MS_MIN = 1;
export const PULSE_MS_MAX = 2000;
export const PULSE_PAUSE_MAX = 10;
export const PULSE_REPS_MAX = 256;
/** Max gate as a fraction of a step, keeps pulses articulated. */
export const PULSE_MAX_GATE = 0.9;

const PATTERN_IDS: readonly PulsePatternId[] = [...PULSE_PATTERNS.map((p) => p.id), 'custom'];

export function parsePattern(steps: string): PulseStep[] {
  return [...steps].map((c) => (c === 'X' ? 2 : c === 'x' ? 1 : 0));
}

const DEFAULT_CUSTOM: PulseStep[] = parsePattern('X..xX.x.X..xx.x.');

export const defaultPulseParams: PulseParams = {
  bpm: 120,
  frequency: 220,
  pulseMs: 50,
  pauseSeconds: 0,
  repetitions: 0,
  pattern: 'eighths',
  accent: 0.35,
  gain: 0.85,
  customSteps: 16,
  custom: DEFAULT_CUSTOM,
};

// ---------------------------------------------------------------- normalize

function num(v: unknown, d: number, lo: number, hi: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}
function int(v: unknown, d: number, lo: number, hi: number): number {
  return Math.round(num(v, d, lo, hi));
}
function oneOf<T extends string>(v: unknown, list: readonly T[], d: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d;
}

export function normalizePulseParams(raw: unknown): PulseParams {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Partial<Record<keyof PulseParams, unknown>>;
  const d = defaultPulseParams;
  let custom = d.custom;
  if (Array.isArray(r.custom)) {
    const src = r.custom as unknown[];
    custom = Array.from({ length: 16 }, (_, i) => {
      const v = src[i];
      return (typeof v === 'number' && Number.isFinite(v) ? Math.min(2, Math.max(0, Math.round(v))) : 0) as PulseStep;
    });
  }
  return {
    bpm: num(r.bpm, d.bpm, PULSE_BPM_MIN, PULSE_BPM_MAX),
    frequency: num(r.frequency, d.frequency, PULSE_FREQ_MIN, PULSE_FREQ_MAX),
    pulseMs: num(r.pulseMs, d.pulseMs, PULSE_MS_MIN, PULSE_MS_MAX),
    pauseSeconds: num(r.pauseSeconds, d.pauseSeconds, 0, PULSE_PAUSE_MAX),
    repetitions: int(r.repetitions, d.repetitions, 0, PULSE_REPS_MAX),
    pattern: oneOf(r.pattern, PATTERN_IDS, d.pattern),
    accent: num(r.accent, d.accent, 0, 1),
    gain: num(r.gain, d.gain, 0, 1),
    customSteps: r.customSteps === 8 ? 8 : r.customSteps === 16 ? 16 : d.customSteps,
    custom,
  };
}

// ---------------------------------------------------------------- build

export interface ResolvedPattern {
  steps: PulseStep[];
  stepsPerBeat: number;
}

export function resolvePattern(p: PulseParams): ResolvedPattern {
  if (p.pattern === 'custom') return { steps: p.custom.slice(0, p.customSteps), stepsPerBeat: p.customSteps === 8 ? 2 : 4 };
  const def = PULSE_PATTERNS.find((x) => x.id === p.pattern) ?? PULSE_PATTERNS[0]!;
  return { steps: parsePattern(def.steps), stepsPerBeat: 4 };
}

export interface PulseTiming {
  /** Seconds per step. */
  step: number;
  /** Effective gate in seconds (after the 90% limit). */
  gate: number;
  /** True when pulseMs was limited by the step length. */
  gateLimited: boolean;
  /** Seconds of one pattern repetition incl. pause. */
  repetition: number;
}

export function pulseTiming(p: PulseParams): PulseTiming {
  const { steps, stepsPerBeat } = resolvePattern(p);
  const step = stepSeconds(p.bpm, stepsPerBeat);
  const want = p.pulseMs / 1000;
  const max = step * PULSE_MAX_GATE;
  return { step, gate: Math.min(want, max), gateLimited: want > max, repetition: steps.length * step + p.pauseSeconds };
}

/** One pattern repetition starting at `offset` seconds. */
function repetitionEvents(p: PulseParams, pattern: ResolvedPattern, t: PulseTiming, offset: number): ToneEvent[] {
  const out: ToneEvent[] = [];
  const normal = p.gain * (1 - p.accent);
  pattern.steps.forEach((v, i) => {
    if (v === 0) return;
    out.push({ time: offset + i * t.step, duration: t.gate, freqStart: p.frequency, gain: v === 2 ? p.gain : normal, step: i });
  });
  return out;
}

export function buildPulsePlayable(params: PulseParams): Playable | null {
  const p = normalizePulseParams(params);
  const pattern = resolvePattern(p);
  if (!pattern.steps.some((v) => v > 0)) return null;
  const t = pulseTiming(p);
  const label = `pulse-${Math.round(p.bpm)}bpm-${Math.round(p.frequency)}hz`;
  const reps = p.repetitions > 0 ? p.repetitions : 1;
  const events: ToneEvent[] = [];
  for (let r = 0; r < reps; r++) events.push(...repetitionEvents(p, pattern, t, r * t.repetition));
  const seq: Sequence = { events, length: reps * t.repetition, bpm: p.bpm, label };
  if (p.repetitions > 0) return seq;
  // Continuous: endless source, every chunk is one repetition.
  return { kind: 'source', chunk: () => seq, chunkCount: Infinity, bpm: p.bpm, label };
}
