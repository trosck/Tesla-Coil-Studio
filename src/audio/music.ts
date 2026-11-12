/**
 * Music utilities: note names <-> MIDI <-> frequency (12-TET, A4 = 440 Hz,
 * MIDI 69), scales and quantization, and a seeded PRNG.
 */

export const A4_FREQ = 440;
export const A4_MIDI = 69;

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const NOTE_OFFSETS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function midiToFreq(midi: number, a4 = A4_FREQ): number {
  return a4 * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Fractional MIDI number for a frequency. */
export function freqToMidi(freq: number, a4 = A4_FREQ): number {
  return A4_MIDI + 12 * Math.log2(freq / a4);
}

/** "C4" = 60 (scientific pitch notation, middle C = C4). */
export function midiToNoteName(midi: number): string {
  const m = Math.round(midi);
  const name = NOTE_NAMES_SHARP[((m % 12) + 12) % 12]!;
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

/** Parse "C4", "c#3", "Db5", "A-1", "Bb", (octave defaults to 4). Returns null if invalid. */
export function noteNameToMidi(name: string): number | null {
  const m = /^\s*([A-Ga-g])([#b♯♭]*)(-?\d+)?\s*$/.exec(name);
  if (!m) return null;
  let semis = NOTE_OFFSETS[m[1]!.toUpperCase()]!;
  for (const ch of m[2]!) semis += ch === '#' || ch === '♯' ? 1 : -1;
  const octave = m[3] !== undefined ? parseInt(m[3], 10) : 4;
  return (octave + 1) * 12 + semis;
}

export function noteNameToFreq(name: string, a4 = A4_FREQ): number | null {
  const midi = noteNameToMidi(name);
  return midi === null ? null : midiToFreq(midi, a4);
}

export interface NearestNote {
  midi: number;
  name: string;
  /** Deviation from the nearest note in cents (-50..+50). */
  cents: number;
  /** Exact frequency of the nearest note. */
  freq: number;
}

export function freqToNearestNote(freq: number, a4 = A4_FREQ): NearestNote | null {
  if (!(freq > 0) || !Number.isFinite(freq)) return null;
  const exact = freqToMidi(freq, a4);
  const midi = Math.round(exact);
  return { midi, name: midiToNoteName(midi), cents: (exact - midi) * 100, freq: midiToFreq(midi, a4) };
}

// ---------------------------------------------------------------- scales

export type ScaleId = 'c-major' | 'a-minor' | 'c-minor' | 'd-minor' | 'pentatonic' | 'chromatic';

export interface Scale {
  id: ScaleId;
  label: string;
  /** Root pitch class (0 = C). */
  root: number;
  /** Semitone offsets from the root within one octave, ascending, starting with 0. */
  intervals: readonly number[];
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];

export const SCALES: Record<ScaleId, Scale> = {
  'c-major': { id: 'c-major', label: 'C Major', root: 0, intervals: MAJOR },
  'a-minor': { id: 'a-minor', label: 'A Minor', root: 9, intervals: NATURAL_MINOR },
  'c-minor': { id: 'c-minor', label: 'C Minor', root: 0, intervals: NATURAL_MINOR },
  'd-minor': { id: 'd-minor', label: 'D Minor', root: 2, intervals: NATURAL_MINOR },
  pentatonic: { id: 'pentatonic', label: 'Pentatonic (C major)', root: 0, intervals: [0, 2, 4, 7, 9] },
  chromatic: { id: 'chromatic', label: 'Chromatic', root: 0, intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export const SCALE_LIST: readonly Scale[] = Object.values(SCALES);

/** Pitch classes (0..11) contained in a scale. */
export function scalePitchClasses(scale: Scale): number[] {
  return scale.intervals.map((i) => (scale.root + i) % 12).sort((a, b) => a - b);
}

export function isInScale(midi: number, scale: Scale): boolean {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  return scalePitchClasses(scale).includes(pc);
}

/** Nearest MIDI note in the scale (ties resolve downward). */
export function quantizeMidi(midi: number, scale: Scale): number {
  const center = Math.round(midi);
  let best = center;
  let bestDist = Infinity;
  for (let d = -12; d <= 12; d++) {
    const cand = center + d;
    if (!isInScale(cand, scale)) continue;
    const dist = Math.abs(cand - midi);
    if (dist < bestDist - 1e-9) {
      best = cand;
      bestDist = dist;
    }
  }
  return best;
}

/** Snap a frequency to the nearest scale note's frequency. */
export function quantizeFreq(freq: number, scale: Scale, a4 = A4_FREQ): number {
  return midiToFreq(quantizeMidi(freqToMidi(freq, a4), scale), a4);
}

/** All scale notes between two MIDI numbers (inclusive), ascending. */
export function scaleNotesInRange(scale: Scale, lowMidi: number, highMidi: number): number[] {
  const out: number[] = [];
  for (let m = Math.ceil(lowMidi); m <= Math.floor(highMidi); m++) if (isInScale(m, scale)) out.push(m);
  return out;
}

/** n-th scale degree above (or below for negative n) a root MIDI note in the scale. */
export function scaleDegreeToMidi(scale: Scale, degree: number, octaveBaseMidi = 60): number {
  const len = scale.intervals.length;
  const oct = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  const rootMidi = octaveBaseMidi - (((octaveBaseMidi % 12) - scale.root + 12) % 12);
  return rootMidi + oct * 12 + scale.intervals[idx]!;
}

// ---------------------------------------------------------------- timing

/** Seconds per beat. */
export function beatSeconds(bpm: number): number {
  return 60 / bpm;
}

/** Seconds per step for a step subdivision (e.g. 4 = sixteenth notes in 4/4). */
export function stepSeconds(bpm: number, stepsPerBeat = 4): number {
  return 60 / bpm / stepsPerBeat;
}

// ---------------------------------------------------------------- PRNG

/** Deterministic 32-bit PRNG. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string (or number) to a 32-bit seed. */
export function hashSeed(input: string | number): number {
  const s = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)]!,
    chance: (p) => next() < p,
  };
}
