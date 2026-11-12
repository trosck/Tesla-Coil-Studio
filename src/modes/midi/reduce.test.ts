import { describe, expect, it } from 'vitest';
import { enforceGap, maxPolyphony, reducePolyphony, type MonoNote, type ReduceOptions } from './reduce';
import type { MidiNote } from './types';

const n = (midi: number, time: number, duration: number, velocity = 0.8): MidiNote => ({ midi, time, duration, velocity });

/** Exact options for tests: no gap, no min length unless given. */
const run = (notes: MidiNote[], o: Partial<ReduceOptions> = {}) => reducePolyphony(notes, { minGap: 0, minNote: 0, retrigger: true, strategy: 'highest', ...o });

/** [midi, time, duration] rounded to µs for comparisons. */
const shape = (out: MonoNote[]) => out.map((x) => [x.midi, +x.time.toFixed(6), +x.duration.toFixed(6)]);

function assertNoOverlap(out: MonoNote[], gap = 0) {
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1]!;
    const b = out[i]!;
    expect(b.time).toBeGreaterThanOrEqual(a.time + a.duration + gap - 1e-9);
  }
  for (const x of out) expect(x.duration).toBeGreaterThan(0);
}

describe('maxPolyphony', () => {
  it('counts simultaneous notes; touching notes do not overlap', () => {
    expect(maxPolyphony([])).toBe(0);
    expect(maxPolyphony([n(60, 0, 1), n(62, 1, 1)])).toBe(1);
    expect(maxPolyphony([n(60, 0, 2), n(64, 0, 2), n(67, 0.5, 1), n(72, 3, 1)])).toBe(3);
  });
});

describe('reducePolyphony', () => {
  it('passes a monophonic line through unchanged', () => {
    const out = run([n(60, 0, 0.5), n(62, 0.5, 0.5), n(64, 1, 0.5)]);
    expect(shape(out)).toEqual([
      [60, 0, 0.5],
      [62, 0.5, 0.5],
      [64, 1, 0.5],
    ]);
  });

  it('returns [] for empty / zero-length input', () => {
    expect(run([])).toEqual([]);
    expect(run([n(60, 0, 0)])).toEqual([]);
  });

  it('highest: picks the top note of a chord', () => {
    const out = run([n(60, 0, 1), n(64, 0, 1), n(67, 0, 1)]);
    expect(shape(out)).toEqual([[67, 0, 1]]);
  });

  it('lowest: picks the bottom note of a chord', () => {
    const out = run([n(60, 0, 1), n(64, 0, 1), n(67, 0, 1)], { strategy: 'lowest' });
    expect(shape(out)).toEqual([[60, 0, 1]]);
  });

  it('highest: a higher note truncates the sounding one; the held lower note resumes (retrigger)', () => {
    const out = run([n(60, 0, 2), n(72, 0.5, 0.5)]);
    expect(shape(out)).toEqual([
      [60, 0, 0.5],
      [72, 0.5, 0.5],
      [60, 1, 1],
    ]);
  });

  it('retrigger off: the truncated note is not resumed', () => {
    const out = run([n(60, 0, 2), n(72, 0.5, 0.5)], { retrigger: false });
    expect(shape(out)).toEqual([
      [60, 0, 0.5],
      [72, 0.5, 0.5],
    ]);
  });

  it('retrigger off: a later lower note that lost never sounds, a new note after silence does', () => {
    const out = run([n(72, 0, 1), n(60, 0.5, 1.5), n(64, 1.5, 0.5)], { retrigger: false });
    expect(shape(out)).toEqual([
      [72, 0, 1],
      [64, 1.5, 0.5],
    ]);
  });

  it('highest: a lower note starting under a held higher note is ignored until the higher ends', () => {
    const out = run([n(72, 0, 1), n(60, 0.25, 1.75)]);
    expect(shape(out)).toEqual([
      [72, 0, 1],
      [60, 1, 1],
    ]);
  });

  it('recent: the newest note wins (even if lower), previous held note resumes', () => {
    const out = run([n(72, 0, 2), n(60, 0.5, 0.5)], { strategy: 'recent' });
    expect(shape(out)).toEqual([
      [72, 0, 0.5],
      [60, 0.5, 0.5],
      [72, 1, 1],
    ]);
  });

  it('recent: chord onset resolves to the top note', () => {
    const out = run([n(60, 0, 1), n(67, 0, 1), n(64, 0, 1)], { strategy: 'recent' });
    expect(shape(out)).toEqual([[67, 0, 1]]);
  });

  it('recent: with several held notes, resumes the most recent still-held one', () => {
    const out = run([n(60, 0, 3), n(64, 0.5, 2), n(67, 1, 0.5)], { strategy: 'recent' });
    expect(shape(out)).toEqual([
      [60, 0, 0.5],
      [64, 0.5, 0.5],
      [67, 1, 0.5],
      [64, 1.5, 1],
      [60, 2.5, 0.5],
    ]);
  });

  it('loudest: the highest velocity wins; ties break to the higher pitch', () => {
    const out = run([n(60, 0, 1, 0.9), n(72, 0, 1, 0.4)], { strategy: 'loudest' });
    expect(shape(out)).toEqual([[60, 0, 1]]);
    const tie = run([n(60, 0, 1, 0.5), n(72, 0, 1, 0.5)], { strategy: 'loudest' });
    expect(shape(tie)).toEqual([[72, 0, 1]]);
    const louder = run([n(60, 0, 2, 0.4), n(55, 0.5, 0.5, 1)], { strategy: 'loudest' });
    expect(shape(louder)).toEqual([
      [60, 0, 0.5],
      [55, 0.5, 0.5],
      [60, 1, 1],
    ]);
  });

  it('keeps the velocity of the source note and its index', () => {
    const out = run([n(60, 0, 1, 0.3), n(72, 0.2, 0.3, 0.9)]);
    expect(out.map((x) => [x.velocity, x.source])).toEqual([
      [0.3, 0],
      [0.9, 1],
      [0.3, 0],
    ]);
  });

  it('identical doubled notes (two tracks) produce one note', () => {
    const out = run([n(60, 0, 1), n(60, 0, 1)]);
    expect(shape(out)).toEqual([[60, 0, 1]]);
  });

  it('unsorted input is handled', () => {
    const out = run([n(64, 1, 0.5), n(60, 0, 0.5)]);
    expect(shape(out)).toEqual([
      [60, 0, 0.5],
      [64, 1, 0.5],
    ]);
  });

  it('minimum gap shortens the earlier note so repeated notes articulate', () => {
    const out = run([n(60, 0, 0.5), n(60, 0.5, 0.5), n(60, 1, 0.5)], { minGap: 0.02 });
    expect(shape(out)).toEqual([
      [60, 0, 0.48],
      [60, 0.5, 0.48],
      [60, 1, 0.5],
    ]);
    assertNoOverlap(out, 0.02);
  });

  it('minimum gap also applies after a truncation', () => {
    const out = run([n(60, 0, 2), n(72, 0.5, 0.5)], { minGap: 0.01 });
    expect(shape(out)).toEqual([
      [60, 0, 0.49],
      [72, 0.5, 0.49],
      [60, 1, 1],
    ]);
  });

  it('minimum note length drops short input notes and short fragments', () => {
    // 0.01 s grace note is dropped before reduction
    expect(shape(run([n(72, 0, 0.01), n(60, 0, 1)], { minNote: 0.02 }))).toEqual([[60, 0, 1]]);
    // a fragment of 60 between 72 ending at 1.0 and 74 starting at 1.005 is dropped
    const out = run([n(60, 0, 2), n(72, 0, 1), n(74, 1.005, 0.5)], { minNote: 0.02 });
    expect(shape(out)).toEqual([
      [72, 0, 1],
      [74, 1.005, 0.5],
      [60, 1.505, 0.495],
    ]);
  });

  it('dense random polyphony never overlaps, for every strategy', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const notes: MidiNote[] = [];
    for (let i = 0; i < 2000; i++) notes.push(n(40 + Math.floor(rnd() * 40), rnd() * 60, 0.01 + rnd() * 2, rnd()));
    for (const strategy of ['highest', 'lowest', 'recent', 'loudest'] as const) {
      for (const retrigger of [true, false]) {
        const out = reducePolyphony(notes, { strategy, retrigger, minGap: 0.015, minNote: 0.02 });
        expect(out.length).toBeGreaterThan(0);
        assertNoOverlap(out, 0.015);
      }
    }
  });

  it('highest output always equals the max of sounding notes (no gap)', () => {
    const notes = [n(60, 0, 4), n(64, 1, 2), n(67, 1.5, 0.5), n(62, 2.5, 3)];
    const out = run(notes);
    for (const seg of out) {
      const mid = seg.time + seg.duration / 2;
      const sounding = notes.filter((x) => x.time <= mid && x.time + x.duration > mid).map((x) => x.midi);
      expect(seg.midi).toBe(Math.max(...sounding));
    }
  });
});

describe('enforceGap', () => {
  it('drops notes that the gap would eat completely', () => {
    const out = enforceGap(
      [
        { ...n(60, 0, 0.005), source: 0 },
        { ...n(62, 0.005, 1), source: 1 },
      ],
      0.01,
    );
    expect(out.map((x) => x.midi)).toEqual([62]);
  });
});
