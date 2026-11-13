import { describe, expect, it } from 'vitest';
import { createRng, isInScale } from '../../audio/music';
import { emptyPattern, keyScale } from './build';
import { applyGateToAll, clickCell, isTiedToNext, randomizePattern, setStepCount, snapPatternToScale, toggleMute, toggleRest, transposePattern, updateStep } from './pattern';

describe('pattern editing', () => {
  it('click sets a note, clicking it again makes a rest', () => {
    let p = emptyPattern();
    p = clickCell(p, 3, 64, 0.5);
    expect(p.notes[3]).toMatchObject({ on: true, midi: 64, length: 0.5 });
    p = clickCell(p, 3, 67, 1);
    expect(p.notes[3]).toMatchObject({ on: true, midi: 67, length: 0.5 });
    p = clickCell(p, 3, 67, 0.5);
    expect(p.notes[3]!.on).toBe(false);
    expect(p.notes[3]!.midi).toBe(67);
  });
  it('toggleRest keeps the pitch; updateStep clamps', () => {
    let p = updateStep(emptyPattern(), 0, { midi: 999, length: 0 as never, velocity: -2 });
    expect(p.notes[0]).toMatchObject({ midi: 108, length: 0.5, velocity: 0 });
    expect(updateStep(p, 0, { length: 3 as never }).notes[0]!.length).toBe(1);
    p = toggleRest(p, 0);
    expect(p.notes[0]!.on).toBe(true);
  });
  it('toggleMute flips muted and keeps the note data', () => {
    let p = clickCell(emptyPattern(), 2, 64, 1);
    p = toggleMute(p, 2);
    expect(p.notes[2]).toMatchObject({ on: true, muted: true, midi: 64, length: 1 });
    p = toggleMute(p, 2);
    expect(p.notes[2]!.muted).toBe(false);
  });
  it('clicking in a muted column unmutes it', () => {
    const muted = toggleMute(clickCell(emptyPattern(), 2, 64, 1), 2);
    // same pitch: unmutes, does not remove
    expect(clickCell(muted, 2, 64, 0.5).notes[2]).toMatchObject({ on: true, muted: false, midi: 64, length: 1 });
    // other pitch: places the note and unmutes
    expect(clickCell(muted, 2, 67, 0.5).notes[2]).toMatchObject({ on: true, muted: false, midi: 67, length: 1 });
    // muted rest column: places a note with the default gate
    const mutedRest = toggleMute(emptyPattern(), 5);
    expect(clickCell(mutedRest, 5, 60, 0.5).notes[5]).toMatchObject({ on: true, muted: false, midi: 60, length: 0.5 });
  });
  it('growing adds rests (no duplication), shrinking keeps hidden data', () => {
    const p = clickCell(emptyPattern(4), 2, 60, 0.5);
    const p32 = setStepCount(p, 32);
    expect(p32.steps).toBe(32);
    expect(p32.notes[2]).toMatchObject({ on: true, midi: 60 });
    expect(p32.notes.slice(4).every((s) => !s.on)).toBe(true);
    const edited = clickCell(p32, 20, 72, 0.5);
    const back = setStepCount(edited, 8);
    expect(back.steps).toBe(8);
    expect(back.notes[20]).toMatchObject({ on: true, midi: 72 });
    const again = setStepCount(back, 32);
    expect(again.notes[20]).toMatchObject({ on: true, midi: 72 });
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
    expect(applyGateToAll(p, 0.25).notes[0]!.length).toBe(0.5);
    expect(applyGateToAll(p, 1).notes[0]!.length).toBe(1);
  });
  it('detects ties', () => {
    const p = updateStep(clickCell(emptyPattern(), 0, 60, 0.5), 0, { length: 1 });
    expect(isTiedToNext(p, 0)).toBe(true);
    expect(isTiedToNext(clickCell(emptyPattern(), 0, 60, 0.5), 0)).toBe(false);
    expect(isTiedToNext(toggleMute(p, 0), 0)).toBe(false);
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
      // every note gets the gate as its length and is not muted
      for (const s of p.notes.slice(0, 16)) {
        if (s.on) expect(s).toMatchObject({ length: 0.5, muted: false });
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
  it('snaps the gate option', () => {
    const p = randomizePattern(emptyPattern(16), { scale, lowMidi: 57, highMidi: 81, density: 1, gate: 0.9, rng: createRng(7) });
    expect(p.notes.slice(0, 16).filter((s) => s.on).every((s) => s.length === 1)).toBe(true);
  });
  it('keeps hidden steps beyond the played length', () => {
    const base = clickCell(setStepCount(emptyPattern(16), 32), 25, 70, 0.5);
    const short = setStepCount(base, 16);
    const r = randomizePattern(short, { scale, lowMidi: 57, highMidi: 81, density: 0.5, gate: 0.5, rng: createRng(3) });
    expect(r.notes[25]).toMatchObject({ on: true, midi: 70 });
  });
});
