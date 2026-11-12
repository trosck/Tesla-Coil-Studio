import { describe, expect, it } from 'vitest';
import { createRng, isInScale } from '../../audio/music';
import { emptyPattern, keyScale } from './build';
import { applyGateToAll, clickCell, isTiedToNext, randomizePattern, setStepCount, snapPatternToScale, toggleRest, transposePattern, updateStep } from './pattern';

describe('pattern editing', () => {
  it('click sets a note, clicking it again makes a rest', () => {
    let p = emptyPattern();
    p = clickCell(p, 3, 64, 0.5);
    expect(p.notes[3]).toMatchObject({ on: true, midi: 64, length: 0.5 });
    p = clickCell(p, 3, 67, 0.75);
    expect(p.notes[3]).toMatchObject({ on: true, midi: 67, length: 0.5 });
    p = clickCell(p, 3, 67, 0.5);
    expect(p.notes[3]!.on).toBe(false);
    expect(p.notes[3]!.midi).toBe(67);
  });
  it('toggleRest keeps the pitch; updateStep clamps', () => {
    let p = updateStep(emptyPattern(), 0, { midi: 999, length: 0, velocity: -2 });
    expect(p.notes[0]).toMatchObject({ midi: 108, length: 0.1, velocity: 0 });
    p = toggleRest(p, 0);
    expect(p.notes[0]!.on).toBe(true);
  });
  it('16 -> 32 duplicates an empty upper half, 32 -> 16 keeps data', () => {
    const p = clickCell(emptyPattern(16), 2, 60, 0.5);
    const p32 = setStepCount(p, 32);
    expect(p32.steps).toBe(32);
    expect(p32.notes[18]).toMatchObject({ on: true, midi: 60 });
    const edited = clickCell(p32, 20, 72, 0.5);
    const back = setStepCount(edited, 16);
    expect(back.steps).toBe(16);
    expect(back.notes[20]).toMatchObject({ on: true, midi: 72 });
    const again = setStepCount(back, 32);
    expect(again.notes[20]).toMatchObject({ on: true, midi: 72 });
    expect(again.notes[18]).toMatchObject({ on: true, midi: 60 });
  });
  it('transposes and limits the shift to the MIDI range', () => {
    const p = clickCell(clickCell(emptyPattern(), 0, 60, 0.5), 1, 100, 0.5);
    const up = transposePattern(p, 12);
    expect(up.notes[0]!.midi).toBe(68);
    expect(up.notes[1]!.midi).toBe(108);
    expect(transposePattern(p, -1).notes[0]!.midi).toBe(59);
  });
  it('snaps to scale and applies the gate', () => {
    const scale = keyScale({ scale: 'c-major', root: 0 });
    const p = snapPatternToScale(clickCell(emptyPattern(), 0, 61, 0.5), scale);
    expect(p.notes[0]!.midi).toBe(60);
    expect(applyGateToAll(p, 0.25).notes[0]!.length).toBe(0.25);
  });
  it('detects ties', () => {
    const p = updateStep(clickCell(emptyPattern(), 0, 60, 0.5), 0, { length: 1 });
    expect(isTiedToNext(p, 0)).toBe(true);
    expect(isTiedToNext(clickCell(emptyPattern(), 0, 60, 0.5), 0)).toBe(false);
  });
});

describe('randomizePattern', () => {
  const scale = keyScale({ scale: 'a-minor', root: 9 });
  it('stays in scale and range, starts on the downbeat, respects density', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = randomizePattern(emptyPattern(16), { scale, lowMidi: 57, highMidi: 81, density: 0.6, gate: 0.5, rng: createRng(seed) });
      expect(p.notes[0]!.on).toBe(true);
      for (const s of p.notes.slice(0, 16)) {
        if (!s.on) continue;
        expect(isInScale(s.midi, scale)).toBe(true);
        expect(s.midi).toBeGreaterThanOrEqual(57);
        expect(s.midi).toBeLessThanOrEqual(81);
        expect(s.velocity).toBeGreaterThan(0);
      }
      // held notes only hold over rests
      for (let i = 0; i < 15; i++) {
        const s = p.notes[i]!;
        if (s.on && s.length >= 1) expect(p.notes[i + 1]!.on).toBe(false);
      }
    }
    const count = (d: number) => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++)
        n += randomizePattern(emptyPattern(16), { scale, lowMidi: 57, highMidi: 81, density: d, gate: 0.5, rng: createRng(seed) }).notes.filter((s) => s.on).length;
      return n;
    };
    expect(count(1)).toBeGreaterThan(count(0.1));
  });
  it('keeps hidden steps beyond the played length', () => {
    const base = clickCell(setStepCount(emptyPattern(16), 32), 25, 70, 0.5);
    const short = setStepCount(base, 16);
    const r = randomizePattern(short, { scale, lowMidi: 57, highMidi: 81, density: 0.5, gate: 0.5, rng: createRng(3) });
    expect(r.notes[25]).toMatchObject({ on: true, midi: 70 });
  });
});
