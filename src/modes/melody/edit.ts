/**
 * Pure sequence-editing helpers for the melody editor, plus the computer
 * keyboard -> piano mapping.
 */
import { isInScale, type Scale } from '../../audio/music';
import { MAX_NOTES, MIDI_MAX, MIDI_MIN, type MelodyNote } from './build';

const clampIndex = (i: number, len: number) => Math.min(len, Math.max(0, Math.round(i)));

/** Insert a note at `index` (0..length). Returns a new array (unchanged if full). */
export function insertNote(notes: readonly MelodyNote[], index: number, note: MelodyNote): MelodyNote[] {
  if (notes.length >= MAX_NOTES) return [...notes];
  const i = clampIndex(index, notes.length);
  return [...notes.slice(0, i), note, ...notes.slice(i)];
}

export function removeNote(notes: readonly MelodyNote[], index: number): MelodyNote[] {
  if (index < 0 || index >= notes.length) return [...notes];
  return [...notes.slice(0, index), ...notes.slice(index + 1)];
}

export function updateNote(notes: readonly MelodyNote[], index: number, patch: Partial<MelodyNote>): MelodyNote[] {
  if (index < 0 || index >= notes.length) return [...notes];
  return notes.map((x, i) => (i === index ? { ...x, ...patch } : x));
}

/** Swap the note at `index` with its neighbour in direction `dir` (-1 / +1). */
export function moveNote(notes: readonly MelodyNote[], index: number, dir: -1 | 1): MelodyNote[] {
  const j = index + dir;
  if (index < 0 || index >= notes.length || j < 0 || j >= notes.length) return [...notes];
  const out = [...notes];
  [out[index], out[j]] = [out[j]!, out[index]!];
  return out;
}

/**
 * Move a pitch by one step: a semitone, or the next note of `scale` when
 * snapping. Clamped to the playable MIDI range.
 */
export function stepPitch(midi: number, dir: -1 | 1, scale: Scale | null): number {
  let m = midi + dir;
  if (scale) {
    while (m > MIDI_MIN && m < MIDI_MAX && !isInScale(m, scale)) m += dir;
  }
  return Math.min(MIDI_MAX, Math.max(MIDI_MIN, m));
}

/**
 * Physical key code (KeyboardEvent.code, layout independent) -> semitone
 * offset from C of the keyboard's base octave.
 * Lower row of white keys A S D F G H J K L ; ' with black keys on W E T Y U O P.
 */
export const KEY_TO_SEMITONE: Readonly<Record<string, number>> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyO: 13,
  KeyL: 14,
  KeyP: 15,
  Semicolon: 16,
  Quote: 17,
};

/** Display labels for the mapped keys, by semitone offset. */
export const SEMITONE_TO_KEY_LABEL: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(KEY_TO_SEMITONE).map(([code, semi]) => [semi, code === 'Semicolon' ? ';' : code === 'Quote' ? "'" : code.slice(3)]),
);

/** MIDI number of C in an octave (scientific pitch: C4 = 60). */
export function octaveBaseMidi(octave: number): number {
  return (octave + 1) * 12;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}
