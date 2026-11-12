/**
 * Random mode: seeded generative phrases, pure and deterministic.
 *
 * A phrase is `bars` bars of 4/4 on a step grid (`stepsPerBeat` steps per
 * beat at `bpm`). For every step the generator decides (seeded PRNG):
 * - rest (probability `restProbability`) or note;
 * - the next pitch: with probability `randomness` a free leap anywhere in the
 *   range, otherwise a step to a neighbouring scale degree (or a small move
 *   in free mode). randomness 0 = smooth stepwise walk, 1 = all leaps;
 * - note length: with probability `randomness / 3` a note spans 2–3 steps.
 * Each note sounds for `gate` × its length (gate < 1 keeps notes articulated;
 * gate 1 = legato).
 *
 * Scales: notes are drawn only from the selected scale (re-rooted on `root`)
 * within [minFreq, maxFreq]. 'free' = continuous Hz (log-uniform), no scale.
 *
 * Repeat:
 * - ON  -> a single Sequence = the same phrase (seed); the transport LOOP
 *          toggle repeats it.
 * - OFF -> an endless SequenceSource: chunk i is a new phrase generated with
 *          createRng(seed + i), so live playback and WAV export match.
 */
import { SCALES, createRng, freqToMidi, midiToFreq, quantizeMidi, scaleNotesInRange, stepSeconds, type Rng, type Scale, type ScaleId } from '../../audio/music';
import type { Playable, Sequence, ToneEvent } from '../../audio/types';

export type RandomScale = ScaleId | 'free';

export interface RandomParams {
  /** Hz */
  minFreq: number;
  /** Hz */
  maxFreq: number;
  /** 0..1 (0 = stepwise walk, 1 = random leaps + varied lengths). */
  randomness: number;
  bpm: number;
  /** Grid: 1 = quarters, 2 = eighths, 4 = sixteenths. */
  stepsPerBeat: 1 | 2 | 4;
  /** Fraction of a step the note sounds, 0.05..1. */
  gate: number;
  scale: RandomScale;
  /** Root pitch class 0..11 (C = 0) the scale is transposed to. */
  root: number;
  /** 0..0.9 probability that a step is a rest. */
  restProbability: number;
  /** Integer seed 0..999999. */
  seed: number;
  /** true = repeat the same phrase; false = keep generating new phrases. */
  repeat: boolean;
  /** Phrase length in 4/4 bars. */
  bars: number;
  /** 0..1 */
  gain: number;
}

export const RANDOM_FREQ_MIN = 20;
export const RANDOM_FREQ_MAX = 20000;
export const RANDOM_BPM_MIN = 20;
export const RANDOM_BPM_MAX = 300;
export const RANDOM_BARS_MAX = 16;
export const RANDOM_SEED_MAX = 999999;
export const RANDOM_GATE_MIN = 0.05;
export const RANDOM_REST_MAX = 0.9;

const SCALE_IDS = Object.keys(SCALES) as ScaleId[];
export const RANDOM_SCALES: readonly RandomScale[] = [...SCALE_IDS, 'free'];

export const defaultRandomParams: RandomParams = {
  minFreq: 220,
  maxFreq: 880,
  randomness: 0.35,
  bpm: 120,
  stepsPerBeat: 2,
  gate: 0.6,
  scale: 'a-minor',
  root: 9,
  restProbability: 0.15,
  seed: 1,
  repeat: true,
  bars: 2,
  gain: 0.8,
};

function num(v: unknown, d: number, lo: number, hi: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}
function int(v: unknown, d: number, lo: number, hi: number): number {
  return Math.round(num(v, d, lo, hi));
}

export function normalizeRandomParams(raw: unknown): RandomParams {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Partial<Record<keyof RandomParams, unknown>>;
  const d = defaultRandomParams;
  const scale = typeof r.scale === 'string' && (RANDOM_SCALES as readonly string[]).includes(r.scale) ? (r.scale as RandomScale) : d.scale;
  const spb = r.stepsPerBeat === 1 || r.stepsPerBeat === 2 || r.stepsPerBeat === 4 ? r.stepsPerBeat : d.stepsPerBeat;
  return {
    minFreq: num(r.minFreq, d.minFreq, RANDOM_FREQ_MIN, RANDOM_FREQ_MAX),
    maxFreq: num(r.maxFreq, d.maxFreq, RANDOM_FREQ_MIN, RANDOM_FREQ_MAX),
    randomness: num(r.randomness, d.randomness, 0, 1),
    bpm: num(r.bpm, d.bpm, RANDOM_BPM_MIN, RANDOM_BPM_MAX),
    stepsPerBeat: spb,
    gate: num(r.gate, d.gate, RANDOM_GATE_MIN, 1),
    scale,
    root: int(r.root, scale === 'free' ? d.root : SCALES[scale].root, 0, 11),
    restProbability: num(r.restProbability, d.restProbability, 0, RANDOM_REST_MAX),
    seed: int(r.seed, d.seed, 0, RANDOM_SEED_MAX),
    repeat: typeof r.repeat === 'boolean' ? r.repeat : d.repeat,
    bars: int(r.bars, d.bars, 1, RANDOM_BARS_MAX),
    gain: num(r.gain, d.gain, 0, 1),
  };
}

/** The selected scale transposed to `root`, or null for free mode. */
export function resolveScale(p: RandomParams): Scale | null {
  if (p.scale === 'free') return null;
  return { ...SCALES[p.scale], root: p.root };
}

/** MIDI notes available for the scale within the range (never empty). */
export function scalePool(p: RandomParams): number[] {
  const scale = resolveScale(p);
  if (!scale) return [];
  const lo = Math.min(p.minFreq, p.maxFreq);
  const hi = Math.max(p.minFreq, p.maxFreq);
  const pool = scaleNotesInRange(scale, freqToMidi(lo) - 1e-6, freqToMidi(hi) + 1e-6);
  if (pool.length > 0) return pool;
  return [quantizeMidi((freqToMidi(lo) + freqToMidi(hi)) / 2, scale)];
}

/** Reflect an index into [0, n-1]. */
function reflect(i: number, n: number): number {
  if (n <= 1) return 0;
  if (i < 0) return Math.min(n - 1, -i);
  if (i > n - 1) return Math.max(0, 2 * (n - 1) - i);
  return i;
}

/** Generate one phrase with the given PRNG. */
export function generatePhrase(params: RandomParams, rng: Rng): Sequence {
  const p = normalizeRandomParams(params);
  const step = stepSeconds(p.bpm, p.stepsPerBeat);
  const total = p.bars * 4 * p.stepsPerBeat;
  const pool = scalePool(p);
  const free = pool.length === 0;
  const lo = Math.min(p.minFreq, p.maxFreq);
  const hi = Math.max(p.minFreq, p.maxFreq);
  const ratio = hi / lo;
  const toFreq = (u: number) => lo * Math.pow(ratio, u);

  // current position: index into pool, or u in [0,1] (log-frequency) for free mode
  let idx = free ? 0 : rng.int(0, pool.length - 1);
  let u = rng.next();
  let first = true;

  const events: ToneEvent[] = [];
  let s = 0;
  while (s < total) {
    let len = 1;
    if (rng.chance(p.randomness / 3)) len = rng.int(2, 3);
    len = Math.min(len, total - s);
    const rest = rng.chance(p.restProbability);
    if (!rest) {
      if (!first) {
        if (rng.chance(p.randomness)) {
          if (free) u = rng.next();
          else idx = rng.int(0, pool.length - 1);
        } else if (free) {
          u = Math.min(1, Math.max(0, u + (rng.chance(0.5) ? 1 : -1) * rng.range(0.03, 0.1)));
        } else {
          idx = reflect(idx + (rng.chance(0.5) ? 1 : -1), pool.length);
        }
      }
      first = false;
      const freq = free ? toFreq(u) : midiToFreq(pool[idx]!);
      // gentle downbeat emphasis
      const onBeat = s % p.stepsPerBeat === 0;
      events.push({ time: s * step, duration: len * step * p.gate, freqStart: freq, gain: p.gain * (onBeat ? 1 : 0.85), step: s });
    }
    s += len;
  }
  return { events, length: total * step, bpm: p.bpm, label: `random-${p.seed}` };
}

export function buildRandomPlayable(params: RandomParams): Playable {
  const p = normalizeRandomParams(params);
  if (p.repeat) return generatePhrase(p, createRng(p.seed));
  return {
    kind: 'source',
    chunk: (i) => generatePhrase(p, createRng(p.seed + i)),
    chunkCount: Infinity,
    bpm: p.bpm,
    label: `random-${p.seed}`,
  };
}
