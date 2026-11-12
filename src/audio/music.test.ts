import { describe, expect, it } from 'vitest';
import {
  SCALES,
  createRng,
  freqToMidi,
  freqToNearestNote,
  midiToFreq,
  midiToNoteName,
  mulberry32,
  noteNameToFreq,
  noteNameToMidi,
  quantizeFreq,
  quantizeMidi,
  scaleDegreeToMidi,
  scaleNotesInRange,
} from './music';

describe('music', () => {
  it('converts MIDI <-> frequency', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(60)).toBeCloseTo(261.6256, 3);
    expect(freqToMidi(880)).toBeCloseTo(81, 9);
  });
  it('converts note names', () => {
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(61)).toBe('C#4');
    expect(midiToNoteName(21)).toBe('A0');
    expect(noteNameToMidi('A4')).toBe(69);
    expect(noteNameToMidi('Db5')).toBe(73);
    expect(noteNameToMidi('c-1')).toBe(0);
    expect(noteNameToMidi('H2')).toBeNull();
    expect(noteNameToFreq('A3')).toBeCloseTo(220, 9);
  });
  it('finds the nearest note with cents', () => {
    const n = freqToNearestNote(445)!;
    expect(n.name).toBe('A4');
    expect(n.cents).toBeCloseTo(19.56, 1);
    expect(freqToNearestNote(0)).toBeNull();
  });
  it('quantizes to scales', () => {
    expect(quantizeMidi(61, SCALES['c-major'])).toBe(60); // C# -> C (tie resolves down)
    expect(quantizeMidi(61.6, SCALES['c-major'])).toBe(62);
    expect(quantizeMidi(66, SCALES.pentatonic)).toBe(67); // F# -> G
    expect(quantizeMidi(63, SCALES['d-minor'])).toBe(62);
    expect(quantizeMidi(63.2, SCALES.chromatic)).toBe(63);
    expect(quantizeFreq(450, SCALES['a-minor'])).toBeCloseTo(440, 9);
  });
  it('lists scale notes and degrees', () => {
    expect(scaleNotesInRange(SCALES['c-major'], 60, 72)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(scaleDegreeToMidi(SCALES['a-minor'], 0, 60)).toBe(57);
    expect(scaleDegreeToMidi(SCALES['c-major'], 7, 60)).toBe(72);
    expect(scaleDegreeToMidi(SCALES['c-major'], -1, 60)).toBe(59);
  });
  it('has a deterministic seeded PRNG', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()));
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
    const r = createRng(7);
    for (let i = 0; i < 100; i++) {
      const n = r.int(1, 6);
      expect(n >= 1 && n <= 6).toBe(true);
    }
  });
});
