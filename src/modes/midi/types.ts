/**
 * MIDI mode data types. `MidiSummary` is the plain, structured-clone-safe
 * result of parsing a .mid file (produced in a Web Worker); it is kept in
 * session memory only (not persisted). `MidiParams` are the persisted
 * conversion settings.
 */

/** One note of a parsed file (seconds; velocity 0..1). */
export interface MidiNote {
  midi: number;
  time: number;
  duration: number;
  velocity: number;
}

export interface MidiTrackSummary {
  /** Index in the original file's track list. */
  index: number;
  name: string;
  instrument: string;
  family: string;
  /** 0-based MIDI channel (9 = GM percussion, "channel 10"). */
  channel: number;
  isPercussion: boolean;
  noteCount: number;
  /** Lowest / highest MIDI note number (null when the track is empty). */
  minMidi: number | null;
  maxMidi: number | null;
  /** Notes sorted by time. */
  notes: MidiNote[];
}

export interface MidiTempo {
  time: number;
  bpm: number;
}

export interface MidiSummary {
  name: string;
  /** File duration in seconds (end of the last note). */
  duration: number;
  ppq: number;
  /** Primary tempo (first tempo event, 120 if the file has none). */
  bpm: number;
  tempos: MidiTempo[];
  /** First time signature as [numerator, denominator] (4/4 if none). */
  timeSignature: [number, number];
  timeSignatureChanges: number;
  totalNotes: number;
  tracks: MidiTrackSummary[];
}

export type ReduceStrategy = 'highest' | 'lowest' | 'recent' | 'loudest';
export type TempoMode = 'speed' | 'bpm';
export type DurationMode = 'scale' | 'legato' | 'fixed';
export type FitMode = 'fold' | 'clamp';
export type GainMode = 'velocity' | 'fixed';

export interface MidiParams {
  /** Polyphony reduction strategy. */
  strategy: ReduceStrategy;
  /** Resume a still-held lower-priority note when the winning note ends. */
  retrigger: boolean;
  /** Minimum silence between consecutive output notes (ms). 0 = allow legato. */
  minGapMs: number;
  /** Notes / fragments shorter than this are dropped (ms). */
  minNoteMs: number;
  /** 'speed' uses speedPct; 'bpm' plays at targetBpm relative to the detected tempo. */
  tempoMode: TempoMode;
  speedPct: number;
  targetBpm: number;
  /** Semitones (-48..48). */
  transpose: number;
  /** Keep notes inside [rangeMinHz, rangeMaxHz]. */
  fitRange: boolean;
  fitMode: FitMode;
  rangeMinHz: number;
  rangeMaxHz: number;
  durationMode: DurationMode;
  /** Gate in % of the (reduced) note length, for durationMode 'scale'. */
  durationPct: number;
  /** Note length for durationMode 'fixed' (ms). */
  fixedMs: number;
  gainMode: GainMode;
  /** Output level 0..1 (multiplied by velocity in 'velocity' mode). */
  level: number;
  /** Section start in file seconds. */
  trimStart: number;
  /** Section end in file seconds; 0 = end of file. */
  trimEnd: number;
}
