/**
 * Step sequencer: params model, normalization and the pure build step
 * (params -> Sequence | SequenceSource). No React here, unit-tested in
 * build.test.ts.
 */
import { SCALES, midiToFreq, stepSeconds, type Scale, type ScaleId } from '../../audio/music';
import type { Playable, Sequence, ToneEvent } from '../../audio/types';

// ---------------------------------------------------------------- types

export interface SeqStep {
  /** false = rest (silence). */
  on: boolean;
  /** MIDI note number (kept even while the step is a rest). */
  midi: number;
  /**
   * Gate length in steps (0.1..4). < 1 = articulated note; >= 1 reaches the
   * next step: if that step plays a note it is a legato tie/slide, if it is a
   * rest the note is held over it.
   */
  length: number;
  /** 0..1, used directly as the event gain. */
  velocity: number;
}

export const STEP_COUNTS = [4, 8, 16, 32] as const;
export type StepCount = (typeof STEP_COUNTS)[number];

export function isStepCount(v: unknown): v is StepCount {
  return (STEP_COUNTS as readonly unknown[]).includes(v);
}

export interface SeqPattern {
  /** Number of steps that play. */
  steps: StepCount;
  /**
   * Always MAX_STEPS entries. Steps beyond `steps` are kept (not played), so
   * shrinking and growing again does not lose data.
   */
  notes: SeqStep[];
}

export type GridRange = 1 | 2 | 3;

export interface SequencerParams {
  /** 30..300, steps are 16th notes (4 per beat). */
  bpm: number;
  /** 0..0.75: every off-beat 16th (odd step) is delayed by swing * step. */
  swing: number;
  /** Default length (in steps, 0.1..1) for newly placed notes. */
  gate: number;
  /** Key root pitch class 0..11 (0 = C). Overrides the root of `scale`. */
  root: number;
  /** Scale shape (intervals) used for the grid rows and randomization. */
  scale: ScaleId;
  /** Grid base octave (scientific: root note of octave 3 = e.g. A3). 0..7. */
  octave: number;
  /** Grid height in octaves. */
  range: GridRange;
  /** Randomizer note density 0..1. */
  density: number;
  /** Selected (edited, and played when chain is off) slot 0..SLOT_COUNT-1. */
  current: number;
  /** Chain playback: play the enabled slots in order A..D. */
  chain: boolean;
  /** SLOT_COUNT flags: which slots take part in the chain. */
  chainSlots: boolean[];
  /** SLOT_COUNT patterns. */
  patterns: SeqPattern[];
}

// ---------------------------------------------------------------- constants

export const MAX_STEPS = 32;
export const SLOT_COUNT = 4;
export const SLOT_NAMES = ['A', 'B', 'C', 'D'] as const;
export const STEPS_PER_BEAT = 4;

export const BPM_MIN = 30;
export const BPM_MAX = 300;
export const SWING_MAX = 0.75;
export const LENGTH_MIN = 0.1;
export const LENGTH_MAX = 4;
export const GATE_MIN = 0.1;
export const GATE_MAX = 1;
export const MIDI_MIN = 12; // C0
export const MIDI_MAX = 108; // C8
export const OCTAVE_MIN = 0;
export const OCTAVE_MAX = 7;

// ---------------------------------------------------------------- defaults

export function restStep(midi = 57, length = 0.5): SeqStep {
  return { on: false, midi, length, velocity: 0.8 };
}

export function emptyPattern(steps: StepCount = 16, midi = 57, length = 0.5): SeqPattern {
  return { steps, notes: Array.from({ length: MAX_STEPS }, () => restStep(midi, length)) };
}

/** [midi, velocity, length] or null for a rest. */
type Cell = readonly [number, number, number] | null;

function patternFrom(cells: readonly Cell[], steps: StepCount = 16): SeqPattern {
  const p = emptyPattern(steps);
  cells.forEach((c, i) => {
    if (c) p.notes[i] = { on: true, midi: c[0], velocity: c[1], length: c[2] };
  });
  return p;
}

// A minor electro riff (A3..A4), 128 BPM.
const A3 = 57, C4 = 60, D4 = 62, E4 = 64, G4 = 67, A4 = 69, G3 = 55;
const DEFAULT_A: Cell[] = [
  [A3, 1, 0.5], null, [A4, 0.6, 0.4], [A3, 0.7, 0.5],
  [E4, 0.95, 0.5], null, [C4, 0.7, 0.5], [D4, 0.8, 0.5],
  [A3, 1, 0.5], null, [A4, 0.6, 0.4], [A3, 0.7, 0.5],
  [G4, 0.95, 1.75], null, [E4, 0.75, 0.5], [C4, 0.7, 0.5],
];
const DEFAULT_B: Cell[] = [
  [A3, 1, 0.5], [A3, 0.55, 0.4], [C4, 0.75, 0.5], null,
  [D4, 0.95, 0.5], null, [E4, 0.8, 1], [G4, 0.8, 0.5],
  [A4, 1, 0.5], null, [G4, 0.7, 0.5], [E4, 0.7, 0.5],
  [D4, 0.95, 0.5], [C4, 0.7, 0.5], [G3, 0.8, 1.5], null,
];

export const defaultSequencerParams: SequencerParams = {
  bpm: 128,
  swing: 0,
  gate: 0.5,
  root: 9,
  scale: 'a-minor',
  octave: 3,
  range: 2,
  density: 0.6,
  current: 0,
  chain: false,
  chainSlots: [true, true, false, false],
  patterns: [patternFrom(DEFAULT_A), patternFrom(DEFAULT_B), emptyPattern(), emptyPattern()],
};

// ---------------------------------------------------------------- normalize

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number, lo: number, hi: number) => (finite(v) ? clamp(v, lo, hi) : d);
const int = (v: unknown, d: number, lo: number, hi: number) => (finite(v) ? clamp(Math.round(v), lo, hi) : d);

export function normalizeStep(raw: unknown, fallback: SeqStep): SeqStep {
  if (!isRec(raw)) return { ...fallback };
  return {
    on: typeof raw.on === 'boolean' ? raw.on : fallback.on,
    midi: int(raw.midi, fallback.midi, MIDI_MIN, MIDI_MAX),
    length: num(raw.length, fallback.length, LENGTH_MIN, LENGTH_MAX),
    velocity: num(raw.velocity, fallback.velocity, 0, 1),
  };
}

export function normalizePattern(raw: unknown, fallback: SeqPattern): SeqPattern {
  if (!isRec(raw)) return clonePattern(fallback);
  const steps: StepCount = isStepCount(raw.steps) ? raw.steps : fallback.steps;
  const src = Array.isArray(raw.notes) ? raw.notes : [];
  const notes = Array.from({ length: MAX_STEPS }, (_, i) =>
    normalizeStep(src[i], restStep()),
  );
  return { steps, notes };
}

export function clonePattern(p: SeqPattern): SeqPattern {
  return { steps: p.steps, notes: p.notes.map((s) => ({ ...s })) };
}

export function isScaleId(v: unknown): v is ScaleId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SCALES, v);
}

export function normalizeSequencerParams(raw: unknown): SequencerParams {
  const d = defaultSequencerParams;
  const r: Rec = isRec(raw) ? raw : {};
  const rawPatterns = Array.isArray(r.patterns) ? r.patterns : null;
  const patterns = Array.from({ length: SLOT_COUNT }, (_, i) =>
    rawPatterns ? normalizePattern(rawPatterns[i], emptyPattern()) : clonePattern(d.patterns[i]!),
  );
  const rawChain = Array.isArray(r.chainSlots) ? r.chainSlots : [];
  return {
    bpm: num(r.bpm, d.bpm, BPM_MIN, BPM_MAX),
    swing: num(r.swing, d.swing, 0, SWING_MAX),
    gate: num(r.gate, d.gate, GATE_MIN, GATE_MAX),
    root: finite(r.root) ? ((Math.round(r.root) % 12) + 12) % 12 : d.root,
    scale: isScaleId(r.scale) ? r.scale : d.scale,
    octave: int(r.octave, d.octave, OCTAVE_MIN, OCTAVE_MAX),
    range: r.range === 1 || r.range === 2 || r.range === 3 ? r.range : d.range,
    density: num(r.density, d.density, 0, 1),
    current: int(r.current, d.current, 0, SLOT_COUNT - 1),
    chain: typeof r.chain === 'boolean' ? r.chain : d.chain,
    chainSlots: Array.from({ length: SLOT_COUNT }, (_, i) => (typeof rawChain[i] === 'boolean' ? (rawChain[i] as boolean) : (d.chainSlots[i] ?? false))),
    patterns,
  };
}

// ---------------------------------------------------------------- scale / grid

/** The selected scale shape transposed to `root`. */
export function keyScale(p: Pick<SequencerParams, 'scale' | 'root'>): Scale {
  return { ...SCALES[p.scale], root: p.root };
}

/** Lowest MIDI note of the grid: the root in the base octave. */
export function gridLowMidi(p: Pick<SequencerParams, 'root' | 'octave'>): number {
  return clamp((p.octave + 1) * 12 + p.root, MIDI_MIN, MIDI_MAX);
}

export function gridHighMidi(p: Pick<SequencerParams, 'root' | 'octave' | 'range'>): number {
  return clamp(gridLowMidi(p) + 12 * p.range, MIDI_MIN, MIDI_MAX);
}

// ---------------------------------------------------------------- timing

export function seqStepSeconds(bpm: number): number {
  return stepSeconds(bpm, STEPS_PER_BEAT);
}

/** Start time (s) of step i, including swing on odd (off-beat) steps. */
export function stepTime(i: number, bpm: number, swing: number): number {
  const s = seqStepSeconds(bpm);
  return (i + (i % 2 === 1 ? swing : 0)) * s;
}

/** Exact loop length of a pattern: steps * stepSeconds. */
export function patternSeconds(steps: number, bpm: number): number {
  return steps * seqStepSeconds(bpm);
}

/**
 * Inverse of stepTime: which step is current at `position` seconds into a
 * pattern of `steps` steps (accounts for swing, so held/tied steps still move
 * the playhead). Returns -1 for invalid input.
 */
export function stepAtPosition(position: number, bpm: number, swing: number, steps: number): number {
  if (!finite(position) || !(bpm > 0) || !(steps > 0)) return -1;
  const s = seqStepSeconds(bpm);
  let i = Math.floor(position / s + 1e-9);
  if (i % 2 === 1 && position < (i + swing) * s - 1e-9) i -= 1;
  return clamp(i, 0, steps - 1);
}

// ---------------------------------------------------------------- build

/** Order of slots that play: enabled chain slots, or just the current slot. */
export function playOrder(p: Pick<SequencerParams, 'chain' | 'chainSlots' | 'current'>): number[] {
  if (p.chain) {
    const order = p.chainSlots.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
    if (order.length > 0) return order;
  }
  return [p.current];
}

/** Slot that plays in chunk `chunkIndex`. */
export function slotForChunk(p: Pick<SequencerParams, 'chain' | 'chainSlots' | 'current'>, chunkIndex: number): number {
  const order = playOrder(p);
  const n = order.length;
  return order[((Math.max(0, Math.floor(chunkIndex)) % n) + n) % n]!;
}

/** Compile one pattern into a seamless-looping Sequence. */
export function buildPatternSequence(pattern: SeqPattern, bpm: number, swing: number, label = 'sequencer'): Sequence {
  const length = patternSeconds(pattern.steps, bpm);
  const s = seqStepSeconds(bpm);
  const events: ToneEvent[] = [];
  for (let i = 0; i < pattern.steps; i++) {
    const st = pattern.notes[i];
    if (!st || !st.on || !(st.velocity > 0)) continue;
    const time = stepTime(i, bpm, swing);
    // Notes never ring past the loop end, so the loop restarts cleanly.
    const duration = Math.min(st.length * s, length - time);
    if (!(duration > 0)) continue;
    events.push({ time, duration, freqStart: midiToFreq(st.midi), gain: clamp(st.velocity, 0, 1), step: i });
  }
  return { events, length, bpm, loop: true, label };
}

export function buildSequencer(p: SequencerParams): Playable | null {
  const order = playOrder(p);
  const bpmTag = `${Math.round(p.bpm)}bpm`;
  if (order.length === 1) {
    const slot = order[0]!;
    const pat = p.patterns[slot];
    if (!pat) return null;
    return buildPatternSequence(pat, p.bpm, p.swing, `sequencer-${SLOT_NAMES[slot]}-${bpmTag}`);
  }
  const label = `sequencer-chain-${order.map((i) => SLOT_NAMES[i]).join('')}-${bpmTag}`;
  const seqs = order.map((slot) => buildPatternSequence(p.patterns[slot]!, p.bpm, p.swing, label));
  return {
    kind: 'source',
    chunk: (i) => seqs[((i % seqs.length) + seqs.length) % seqs.length]!,
    chunkCount: seqs.length,
    bpm: p.bpm,
    loop: true,
    label,
  };
}
