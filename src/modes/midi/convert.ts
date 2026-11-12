/**
 * MIDI conversion pipeline (pure):
 *   selected tracks -> trim -> tempo scale -> polyphony reduction ->
 *   duration edit -> min gap -> pitch (transpose / fit to range) -> gain -> Sequence
 */
import { freqToMidi, midiToFreq } from '../../audio/music';
import type { Sequence, ToneEvent } from '../../audio/types';
import { enforceGap, maxPolyphony, reducePolyphony, type MonoNote } from './reduce';
import type { MidiNote, MidiParams, MidiSummary } from './types';

export const SPEED_MIN = 10;
export const SPEED_MAX = 400;
export const BPM_MIN = 10;
export const BPM_MAX = 400;
export const TRANSPOSE_LIMIT = 48;
export const FREQ_LIMIT_MIN = 20;
export const FREQ_LIMIT_MAX = 8000;
/** Silence appended after the last note so loops/exports end cleanly. */
export const TAIL_SECONDS = 0.3;
/** Legato extends a note into a following rest by at most this much (s). */
export const LEGATO_MAX_FILL = 1;

export const defaultMidiParams: MidiParams = {
  strategy: 'highest',
  retrigger: true,
  minGapMs: 15,
  minNoteMs: 20,
  tempoMode: 'speed',
  speedPct: 100,
  targetBpm: 120,
  transpose: 0,
  fitRange: false,
  fitMode: 'fold',
  rangeMinHz: 65,
  rangeMaxHz: 1400,
  durationMode: 'scale',
  durationPct: 100,
  fixedMs: 150,
  gainMode: 'velocity',
  level: 0.85,
  trimStart: 0,
  trimEnd: 0,
};

function num(v: unknown, d: number, lo: number, hi: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}
function oneOf<T extends string>(v: unknown, list: readonly T[], d: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d;
}
function bool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d;
}

export function normalizeMidiParams(raw: unknown): MidiParams {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof MidiParams, unknown>>;
  const d = defaultMidiParams;
  const rangeMinHz = num(r.rangeMinHz, d.rangeMinHz, FREQ_LIMIT_MIN, FREQ_LIMIT_MAX);
  const rangeMaxHz = Math.max(rangeMinHz, num(r.rangeMaxHz, d.rangeMaxHz, FREQ_LIMIT_MIN, FREQ_LIMIT_MAX));
  return {
    strategy: oneOf(r.strategy, ['highest', 'lowest', 'recent', 'loudest'] as const, d.strategy),
    retrigger: bool(r.retrigger, d.retrigger),
    minGapMs: num(r.minGapMs, d.minGapMs, 0, 200),
    minNoteMs: num(r.minNoteMs, d.minNoteMs, 0, 500),
    tempoMode: oneOf(r.tempoMode, ['speed', 'bpm'] as const, d.tempoMode),
    speedPct: num(r.speedPct, d.speedPct, SPEED_MIN, SPEED_MAX),
    targetBpm: num(r.targetBpm, d.targetBpm, BPM_MIN, BPM_MAX),
    transpose: Math.round(num(r.transpose, d.transpose, -TRANSPOSE_LIMIT, TRANSPOSE_LIMIT)),
    fitRange: bool(r.fitRange, d.fitRange),
    fitMode: oneOf(r.fitMode, ['fold', 'clamp'] as const, d.fitMode),
    rangeMinHz,
    rangeMaxHz,
    durationMode: oneOf(r.durationMode, ['scale', 'legato', 'fixed'] as const, d.durationMode),
    durationPct: num(r.durationPct, d.durationPct, 5, 100),
    fixedMs: num(r.fixedMs, d.fixedMs, 5, 5000),
    gainMode: oneOf(r.gainMode, ['velocity', 'fixed'] as const, d.gainMode),
    level: num(r.level, d.level, 0, 1),
    trimStart: num(r.trimStart, d.trimStart, 0, 36000),
    trimEnd: num(r.trimEnd, d.trimEnd, 0, 36000),
  };
}

/** Playback speed factor (1 = original tempo, 2 = twice as fast). */
export function speedFactor(p: MidiParams, detectedBpm: number): number {
  if (p.tempoMode === 'bpm') return p.targetBpm / (detectedBpm > 0 ? detectedBpm : 120);
  return p.speedPct / 100;
}

/** Effective [start, end] of the section in file seconds. */
export function trimWindow(p: MidiParams, fileDuration: number): { start: number; end: number } {
  const start = Math.min(Math.max(0, p.trimStart), fileDuration);
  const end = p.trimEnd > 0 ? Math.min(p.trimEnd, fileDuration) : fileDuration;
  return { start, end: Math.max(start, end) };
}

/** Notes of the selected tracks, merged and sorted by time. */
export function collectNotes(summary: MidiSummary, trackIndices: readonly number[]): MidiNote[] {
  const sel = new Set(trackIndices);
  const out: MidiNote[] = [];
  for (const t of summary.tracks) if (sel.has(t.index)) out.push(...t.notes);
  out.sort((a, b) => a.time - b.time || a.midi - b.midi);
  return out;
}

/** Keep notes overlapping [start, end], clipped to it, shifted so `start` = 0. */
export function trimNotes(notes: readonly MidiNote[], start: number, end: number): MidiNote[] {
  const out: MidiNote[] = [];
  for (const n of notes) {
    const a = Math.max(n.time, start);
    const b = Math.min(n.time + n.duration, end);
    if (b - a > 1e-9) out.push({ ...n, time: a - start, duration: b - a });
  }
  return out;
}

export function scaleTime(notes: readonly MidiNote[], factor: number): MidiNote[] {
  if (factor === 1) return notes.slice();
  return notes.map((n) => ({ ...n, time: n.time / factor, duration: n.duration / factor }));
}

/** MIDI note range [lo, hi] (integers) inside a frequency range. */
export function midiRange(minHz: number, maxHz: number): [number, number] {
  const lo = Math.ceil(freqToMidi(minHz) - 1e-6);
  const hi = Math.floor(freqToMidi(maxHz) + 1e-6);
  return [lo, Math.max(lo, hi)];
}

/**
 * Fit a MIDI note into [lo, hi]: 'fold' moves it by octaves (clamping only if
 * the range is narrower than an octave), 'clamp' pins it to the nearest edge.
 */
export function fitMidi(midi: number, lo: number, hi: number, mode: 'fold' | 'clamp'): number {
  let m = midi;
  if (mode === 'fold') {
    while (m < lo) m += 12;
    while (m > hi) m -= 12;
  }
  return Math.min(hi, Math.max(lo, m));
}

/**
 * Octave shift (multiple of 12 semitones, relative to the current transpose)
 * that puts the most notes inside [lo, hi]; ties prefer the smallest shift.
 */
export function bestOctaveShift(midis: readonly number[], lo: number, hi: number): number {
  if (midis.length === 0) return 0;
  let bestShift = 0;
  let bestCount = -1;
  for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
    const s = k * 12;
    let c = 0;
    for (const m of midis) if (m + s >= lo && m + s <= hi) c++;
    if (c > bestCount) {
      bestCount = c;
      bestShift = s;
    }
  }
  return bestShift;
}

/** Apply the duration mode, then re-enforce the minimum gap (output never overlaps). */
export function applyDurations(notes: readonly MonoNote[], p: MidiParams): MonoNote[] {
  const gap = p.minGapMs / 1000;
  const shaped = notes.map((n, i) => {
    let duration = n.duration;
    if (p.durationMode === 'scale') duration = n.duration * (p.durationPct / 100);
    else if (p.durationMode === 'fixed') duration = p.fixedMs / 1000;
    else {
      const next = notes[i + 1];
      if (next) duration = Math.max(n.duration, Math.min(next.time - n.time, n.duration + LEGATO_MAX_FILL));
    }
    return duration === n.duration ? n : { ...n, duration };
  });
  return enforceGap(shaped, gap);
}

export interface ConversionStats {
  /** Notes of the selected tracks within the trimmed section. */
  originalNotes: number;
  maxPolyphony: number;
  resultNotes: number;
  /** Output duration in seconds (sequence length). */
  duration: number;
  /** Notes moved by fit-to-range. */
  fittedNotes: number;
  speed: number;
  bpm: number;
}

export interface ConversionResult {
  sequence: Sequence | null;
  /** Output melody (output time, sounding MIDI pitch, after all edits). */
  mono: MonoNote[];
  /** Output pitches after transpose but before fit-to-range (for "auto octave"). */
  preFitMidi: number[];
  stats: ConversionStats;
  /** Section in file seconds and speed factor: fileTime = start + outputTime * speed. */
  window: { start: number; end: number };
  speed: number;
}

/** Full pipeline: summary + selected tracks + params -> Sequence. */
export function convertMidi(summary: MidiSummary, trackIndices: readonly number[], p: MidiParams): ConversionResult {
  const speed = speedFactor(p, summary.bpm);
  const window = trimWindow(p, summary.duration);
  const selected = trimNotes(collectNotes(summary, trackIndices), window.start, window.end);
  const scaled = scaleTime(selected, speed);
  const reduced = reducePolyphony(scaled, {
    strategy: p.strategy,
    retrigger: p.retrigger,
    minGap: p.minGapMs / 1000,
    minNote: p.minNoteMs / 1000,
  });
  const timed = applyDurations(reduced, p);

  const [lo, hi] = midiRange(p.rangeMinHz, p.rangeMaxHz);
  let fittedNotes = 0;
  const preFitMidi: number[] = [];
  const mono: MonoNote[] = timed.map((n) => {
    let midi = n.midi + p.transpose;
    preFitMidi.push(midi);
    if (p.fitRange) {
      const f = fitMidi(midi, lo, hi, p.fitMode);
      if (f !== midi) fittedNotes++;
      midi = f;
    }
    return { ...n, midi };
  });

  const events: ToneEvent[] = mono.map((n) => ({
    time: n.time,
    duration: n.duration,
    freqStart: midiToFreq(n.midi),
    gain: p.gainMode === 'velocity' ? p.level * Math.max(0.05, n.velocity) : p.level,
  }));

  const lastEnd = mono.reduce((m, n) => Math.max(m, n.time + n.duration), 0);
  const sectionLength = (window.end - window.start) / speed;
  // A trimmed section keeps its exact length (so it loops in time); the whole
  // file gets a short silent tail.
  const length = events.length ? Math.max(sectionLength, lastEnd) + (window.end < summary.duration ? 0 : TAIL_SECONDS) : 0;
  const bpm = Math.round(summary.bpm * speed * 10) / 10;
  const sequence: Sequence | null = events.length
    ? { events, length, bpm, loop: false, label: `midi-${slug(summary.name)}` }
    : null;

  return {
    sequence,
    mono,
    preFitMidi,
    window,
    speed,
    stats: {
      originalNotes: selected.length,
      maxPolyphony: maxPolyphony(selected),
      resultNotes: mono.length,
      duration: length,
      fittedNotes,
      speed,
      bpm,
    },
  };
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'file'
  );
}

/** Default track selection: every non-percussion track that has notes. */
export function defaultTrackSelection(summary: MidiSummary): number[] {
  const tonal = summary.tracks.filter((t) => !t.isPercussion && t.noteCount > 0).map((t) => t.index);
  if (tonal.length) return tonal;
  return summary.tracks.filter((t) => t.noteCount > 0).map((t) => t.index);
}
