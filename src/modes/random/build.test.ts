import { describe, expect, it } from 'vitest';
import { SCALES, createRng, freqToMidi, isInScale } from '../../audio/music';
import { isSequenceSource, type Sequence } from '../../audio/types';
import { buildRandomPlayable, defaultRandomParams, generatePhrase, normalizeRandomParams, scalePool, type RandomParams } from './build';

const P = (over: Partial<RandomParams> = {}): RandomParams => ({ ...defaultRandomParams, ...over });

describe('random normalize', () => {
  it('defaults and clamps', () => {
    expect(normalizeRandomParams(null)).toEqual(defaultRandomParams);
    const p = normalizeRandomParams({ scale: 'c-major', stepsPerBeat: 3, seed: -4, restProbability: 2, gate: 0, bars: 99, randomness: 7 });
    expect(p).toMatchObject({ scale: 'c-major', root: 0, stepsPerBeat: 2, seed: 0, restProbability: 0.9, gate: 0.05, bars: 16, randomness: 1 });
    expect(normalizeRandomParams({ scale: 'bogus' }).scale).toBe(defaultRandomParams.scale);
  });
});

describe('random build', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = buildRandomPlayable(P({ seed: 7 })) as Sequence;
    const b = buildRandomPlayable(P({ seed: 7 })) as Sequence;
    const c = buildRandomPlayable(P({ seed: 8 })) as Sequence;
    expect(a).toEqual(b);
    expect(a.events.map((e) => e.freqStart)).not.toEqual(c.events.map((e) => e.freqStart));
  });

  it('quantizes to the (re-rooted) scale inside the range', () => {
    const p = P({ scale: 'a-minor', root: 4, minFreq: 200, maxFreq: 1000, randomness: 1, seed: 3, bars: 8 });
    const seq = buildRandomPlayable(p) as Sequence;
    const scale = { ...SCALES['a-minor'], root: 4 };
    expect(seq.events.length).toBeGreaterThan(10);
    for (const e of seq.events) {
      const m = freqToMidi(e.freqStart);
      expect(Math.abs(m - Math.round(m))).toBeLessThan(1e-6);
      expect(isInScale(m, scale)).toBe(true);
      expect(e.freqStart).toBeGreaterThanOrEqual(200);
      expect(e.freqStart).toBeLessThanOrEqual(1000);
    }
  });

  it('randomness 0 walks stepwise through neighbouring degrees', () => {
    const p = P({ randomness: 0, restProbability: 0, scale: 'c-major', root: 0, bars: 4, minFreq: 100, maxFreq: 2000 });
    const pool = scalePool(p);
    const seq = generatePhrase(p, createRng(11));
    const idx = seq.events.map((e) => pool.indexOf(Math.round(freqToMidi(e.freqStart))));
    for (let i = 1; i < idx.length; i++) expect(Math.abs(idx[i]! - idx[i - 1]!)).toBe(1);
    // and every note is exactly one step long
    expect(seq.events).toHaveLength(4 * 4 * 2);
  });

  it('free mode stays within the Hz range and is not quantized', () => {
    const seq = buildRandomPlayable(P({ scale: 'free', minFreq: 300, maxFreq: 600, randomness: 0.8, bars: 8 })) as Sequence;
    let off = 0;
    for (const e of seq.events) {
      expect(e.freqStart).toBeGreaterThanOrEqual(300 - 1e-9);
      expect(e.freqStart).toBeLessThanOrEqual(600 + 1e-9);
      const m = freqToMidi(e.freqStart);
      if (Math.abs(m - Math.round(m)) > 0.01) off++;
    }
    expect(off).toBeGreaterThan(0);
  });

  it('gate shortens notes; rests leave gaps', () => {
    const seq = generatePhrase(P({ gate: 0.5, randomness: 0, restProbability: 0, bpm: 120, stepsPerBeat: 2 }), createRng(1));
    expect(seq.events.every((e) => Math.abs(e.duration - 0.125) < 1e-9)).toBe(true);
    expect(seq.length).toBeCloseTo(4); // 2 bars of 4 beats at 120 BPM
    const sparse = generatePhrase(P({ restProbability: 0.9, randomness: 0 }), createRng(1));
    expect(sparse.events.length).toBeLessThan(8);
  });

  it('repeat OFF = endless deterministic source of new phrases', () => {
    const src = buildRandomPlayable(P({ repeat: false, seed: 5 }));
    expect(isSequenceSource(src)).toBe(true);
    if (!isSequenceSource(src)) return;
    expect(src.chunkCount).toBe(Infinity);
    expect(src.chunk(2)).toEqual(src.chunk(2));
    expect(src.chunk(0)).toEqual(buildRandomPlayable(P({ repeat: true, seed: 5 })));
    expect(src.chunk(1).events.map((e) => e.freqStart)).not.toEqual(src.chunk(0).events.map((e) => e.freqStart));
  });

  it('narrow range without scale notes still yields a note', () => {
    expect(scalePool(P({ scale: 'c-major', root: 0, minFreq: 276, maxFreq: 279 }))).toHaveLength(1);
  });
});
