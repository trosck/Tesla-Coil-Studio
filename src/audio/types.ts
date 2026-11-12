/**
 * Unified event model. Every mode compiles its parameters into a `Sequence`
 * (or a `SequenceSource` for generative/long material). The engine and the
 * offline WAV renderer consume exactly the same data, so live playback and
 * export are identical.
 *
 * Semantics (see ARCHITECTURE.md for the full spec):
 * - Monophonic. If events overlap, the later-starting one wins (cuts the earlier).
 * - Silence is the absence of events.
 * - Events that touch (prev.time + prev.duration === next.time) are played
 *   legato: no release/attack dip, continuous phase. Leave a gap (or a shorter
 *   duration than the step) when you want articulation between notes.
 * - Events with `time >= length` are ignored. Durations may extend past `length`
 *   (they are cut by the next event / next loop's first event if one overlaps).
 */

export type Waveform = 'square' | 'sine' | 'triangle' | 'sawtooth';

/**
 * Frequency glide curve inside one event, for normalized time t in [0, 1]:
 * - linear:      f = f0 + (f1 - f0) * t
 * - exponential: f = f0 * (f1 / f0) ^ t          (constant musical pitch rate)
 * - logarithmic: f = f0 + (f1 - f0) * log10(1 + 9t)  (fast at the start, slow at the end)
 */
export type GlideCurve = 'linear' | 'exponential' | 'logarithmic';

export interface ToneEvent {
  /** Seconds from the start of the sequence (chunk). */
  time: number;
  /** Seconds. Must be > 0. */
  duration: number;
  /** Hz at the start of the event. */
  freqStart: number;
  /** Hz at the end of the event. Omit for a steady tone. */
  freqEnd?: number;
  /** Glide curve used when freqEnd is set. Default 'linear'. */
  curve?: GlideCurve;
  /** 0..1 per-event amplitude ("velocity"). */
  gain: number;
  /** Omit to use the global waveform chosen in the transport bar (recommended). */
  waveform?: Waveform;
  /** Square duty cycle 0.01..0.99. Omit to use the global duty cycle. */
  duty?: number;
  /** Optional step number reported back to the UI as `currentStep` (e.g. sequencer step). */
  step?: number;
}

export interface Sequence {
  events: ToneEvent[];
  /** Loop length in seconds, including trailing silence. Must be > 0. */
  length: number;
  bpm?: number;
  /** Hint for the transport: preferred loop state when this sequence is first played. */
  loop?: boolean;
  label?: string;
}

/**
 * Generative material produced in successive chunks. Chunk `i` is requested
 * exactly once per playback, right before it is due, and is played after chunk
 * `i - 1`. `chunk()` must be deterministic for a given index (use a seeded
 * PRNG, e.g. `mulberry32(seed + index)`) so that export matches live playback.
 *
 * Playback rules:
 * - loop ON:  chunks 0, 1, 2, ... forever.
 * - loop OFF: chunks 0 .. chunkCount-1 (or only chunk 0 when chunkCount is undefined).
 */
export interface SequenceSource {
  kind: 'source';
  chunk(index: number): Sequence;
  /** Number of chunks in one "pass". Undefined = endless. */
  chunkCount?: number;
  bpm?: number;
  loop?: boolean;
  label?: string;
}

/** Anything the transport can play or export. */
export type Playable = Sequence | SequenceSource;

export function isSequenceSource(p: Playable): p is SequenceSource {
  return (p as SequenceSource).kind === 'source';
}

/** Normalize any Playable into a SequenceSource. A Sequence is a 1-chunk source. */
export function toSource(p: Playable): SequenceSource {
  if (isSequenceSource(p)) return p;
  return { kind: 'source', chunk: () => p, chunkCount: 1, bpm: p.bpm, loop: p.loop, label: p.label };
}

export function playableBpm(p: Playable): number | undefined {
  return p.bpm;
}
