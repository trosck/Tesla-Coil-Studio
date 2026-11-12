/**
 * Melody mode: params, validation and the pure params -> Sequence compiler.
 */
import { SCALES, beatSeconds, midiToFreq, type ScaleId } from '../../audio/music';
import type { Sequence, ToneEvent } from '../../audio/types';

/** One sequence entry. `midi: null` = rest. Length in beats (quarter note = 1). */
export interface MelodyNote {
  midi: number | null;
  beats: number;
}

export type DurationId =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'dotted-half'
  | 'dotted-quarter'
  | 'dotted-eighth'
  | 'quarter-triplet'
  | 'eighth-triplet';

export interface MelodyParams {
  /** The melody, in order. */
  notes: MelodyNote[];
  /** Tempo, quarter notes per minute. */
  bpm: number;
  /** Articulation: sounding part of each note, % of its length (100 = legato). */
  gate: number;
  /** Duration used for newly recorded / inserted notes and rests. */
  duration: DurationId;
  /** Scale used for keyboard highlighting and snapping. */
  scale: ScaleId;
  /** Snap played keys (and semitone edits) to the scale. */
  snapToScale: boolean;
  /** Lowest octave shown on the keyboard (C<octave>); the computer keys start there. */
  octave: number;
  /** Note level 0..1. */
  gain: number;
}

export interface DurationDef {
  id: DurationId;
  label: string;
  short: string;
  beats: number;
}

export const DURATIONS: readonly DurationDef[] = [
  { id: 'whole', label: 'Whole', short: '1', beats: 4 },
  { id: 'dotted-half', label: 'Dotted half', short: '1/2.', beats: 3 },
  { id: 'half', label: 'Half', short: '1/2', beats: 2 },
  { id: 'dotted-quarter', label: 'Dotted quarter', short: '1/4.', beats: 1.5 },
  { id: 'quarter', label: 'Quarter', short: '1/4', beats: 1 },
  { id: 'quarter-triplet', label: 'Quarter triplet', short: '1/4T', beats: 2 / 3 },
  { id: 'dotted-eighth', label: 'Dotted eighth', short: '1/8.', beats: 0.75 },
  { id: 'eighth', label: 'Eighth', short: '1/8', beats: 0.5 },
  { id: 'eighth-triplet', label: 'Eighth triplet', short: '1/8T', beats: 1 / 3 },
  { id: 'sixteenth', label: 'Sixteenth', short: '1/16', beats: 0.25 },
];

export const MIDI_MIN = 21; // A0, 27.5 Hz
export const MIDI_MAX = 108; // C8
export const BPM_MIN = 20;
export const BPM_MAX = 300;
export const GATE_MIN = 10;
export const GATE_MAX = 100;
export const OCTAVE_MIN = 1;
export const OCTAVE_MAX = 5;
export const BEATS_MIN = 1 / 16;
export const BEATS_MAX = 16;
export const MAX_NOTES = 512;
export const MELODY_LABEL = 'melody';

export function durationBeats(id: DurationId): number {
  return DURATIONS.find((d) => d.id === id)?.beats ?? 1;
}

/** The duration definition matching a beat count (within rounding), if any. */
export function durationForBeats(beats: number): DurationDef | undefined {
  return DURATIONS.find((d) => Math.abs(d.beats - beats) < 1e-6);
}

export function formatBeats(beats: number): string {
  const d = durationForBeats(beats);
  if (d) return d.short;
  return `${parseFloat(beats.toFixed(3))} b`;
}

const n = (midi: number | null, beats: number): MelodyNote => ({ midi, beats });

/** "Ode to Joy" opening phrase (public domain) — works immediately on first run. */
export const DEMO_MELODY: readonly MelodyNote[] = [
  n(64, 1), n(64, 1), n(65, 1), n(67, 1),
  n(67, 1), n(65, 1), n(64, 1), n(62, 1),
  n(60, 1), n(60, 1), n(62, 1), n(64, 1),
  n(64, 1.5), n(62, 0.5), n(62, 2),
];

export const defaultMelodyParams: MelodyParams = {
  notes: DEMO_MELODY.map((x) => ({ ...x })),
  bpm: 120,
  gate: 85,
  duration: 'quarter',
  scale: 'c-major',
  snapToScale: false,
  octave: 4,
  gain: 0.8,
};

function num(v: unknown, d: number, lo: number, hi: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}

export function normalizeNote(raw: unknown): MelodyNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const beats = num(r.beats, NaN, BEATS_MIN, BEATS_MAX);
  if (!Number.isFinite(beats)) return null;
  if (r.midi === null || r.midi === undefined) return { midi: null, beats };
  if (typeof r.midi !== 'number' || !Number.isFinite(r.midi)) return null;
  return { midi: Math.round(Math.min(MIDI_MAX, Math.max(MIDI_MIN, r.midi))), beats };
}

export function normalizeMelodyParams(raw: unknown): MelodyParams {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = defaultMelodyParams;
  const notes = Array.isArray(r.notes)
    ? r.notes.slice(0, MAX_NOTES).map(normalizeNote).filter((x): x is MelodyNote => x !== null)
    : d.notes.map((x) => ({ ...x }));
  const duration = DURATIONS.some((x) => x.id === r.duration) ? (r.duration as DurationId) : d.duration;
  const scale = typeof r.scale === 'string' && r.scale in SCALES ? (r.scale as ScaleId) : d.scale;
  return {
    notes,
    bpm: num(r.bpm, d.bpm, BPM_MIN, BPM_MAX),
    gate: num(r.gate, d.gate, GATE_MIN, GATE_MAX),
    duration,
    scale,
    snapToScale: typeof r.snapToScale === 'boolean' ? r.snapToScale : d.snapToScale,
    octave: Math.round(num(r.octave, d.octave, OCTAVE_MIN, OCTAVE_MAX)),
    gain: num(r.gain, d.gain, 0, 1),
  };
}

/** Start beat of each note plus the total length in beats. */
export function noteOffsets(notes: readonly MelodyNote[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let t = 0;
  for (const note of notes) {
    starts.push(t);
    t += note.beats;
  }
  return { starts, total: t };
}

/**
 * Compile the melody. Each pitched note becomes one event whose `step` is the
 * note's index in `notes`; rests produce silence. The loop length is the sum of
 * all note/rest lengths. With gate < 100 % every note ends before the next one
 * starts, so repeated pitches are re-articulated; gate 100 % plays legato.
 */
export function buildMelody(p: MelodyParams): Sequence | null {
  if (!p.notes.some((x) => x.midi !== null)) return null;
  const spb = beatSeconds(p.bpm);
  const gate = Math.min(GATE_MAX, Math.max(GATE_MIN, p.gate)) / 100;
  const { starts, total } = noteOffsets(p.notes);
  const events: ToneEvent[] = [];
  p.notes.forEach((note, i) => {
    if (note.midi === null) return;
    events.push({
      time: starts[i]! * spb,
      duration: note.beats * spb * gate,
      freqStart: midiToFreq(note.midi),
      gain: p.gain,
      step: i,
    });
  });
  return { events, length: total * spb, bpm: p.bpm, loop: true, label: MELODY_LABEL };
}
