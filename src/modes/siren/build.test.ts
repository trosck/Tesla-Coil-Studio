import { describe, expect, it } from 'vitest';
import { renderPlayable } from '../../audio/export/renderWav';
import { sampleTrajectory } from '../ramp/trajectory';
import { SMOOTH_PIECES, buildSirenSequence, defaultSirenParams, normalizeSirenParams, smoothAt, type SirenParams } from './build';

const P = (over: Partial<SirenParams> = {}): SirenParams => ({ ...defaultSirenParams, ...over });

describe('siren normalize', () => {
  it('defaults and clamps', () => {
    expect(normalizeSirenParams(42)).toEqual(defaultSirenParams);
    const p = normalizeSirenParams({ minFreq: 0, maxFreq: 99999, cycleSeconds: 0, cycles: 0, direction: 'x', curve: 'smooth', waveform: 'noise', gain: -1 });
    expect(p).toMatchObject({ minFreq: 1, maxFreq: 20000, cycleSeconds: 0.05, cycles: 1, direction: 'alternate', curve: 'smooth', waveform: 'global', gain: 0 });
  });
});

describe('siren build', () => {
  it('alternating sweeps are one continuous legato line', () => {
    const seq = buildSirenSequence(P({ curve: 'linear', cycles: 3, cycleSeconds: 2 }));
    expect(seq.events).toHaveLength(6);
    expect(seq.length).toBe(6);
    for (let i = 1; i < seq.events.length; i++) {
      const a = seq.events[i - 1]!;
      const b = seq.events[i]!;
      expect(a.time + a.duration).toBeCloseTo(b.time, 9);
      expect(a.freqEnd).toBeCloseTo(b.freqStart);
    }
    expect(sampleTrajectory(seq)).toHaveLength(1);
    expect(seq.events[0]).toMatchObject({ freqStart: 300, freqEnd: 1200 });
  });

  it('rising-only sweeps restart at the bottom', () => {
    const seq = buildSirenSequence(P({ direction: 'rise', curve: 'exponential', cycles: 2 }));
    expect(seq.events.map((e) => [e.freqStart, e.freqEnd])).toEqual([
      [300, 1200],
      [300, 1200],
    ]);
    const fall = buildSirenSequence(P({ direction: 'fall', curve: 'exponential', cycles: 1 }));
    expect(fall.events[0]).toMatchObject({ freqStart: 1200, freqEnd: 300 });
  });

  it('smooth curve is piecewise and eases at the ends', () => {
    const seq = buildSirenSequence(P({ cycles: 1 }));
    expect(seq.events).toHaveLength(2 * SMOOTH_PIECES);
    expect(smoothAt(300, 1200, 0)).toBe(300);
    expect(smoothAt(300, 1200, 1)).toBeCloseTo(1200);
    expect(smoothAt(300, 1200, 0.5)).toBeCloseTo(600); // geometric midpoint
    const first = seq.events[0]!;
    const mid = seq.events[SMOOTH_PIECES / 2]!;
    expect(first.freqEnd! / first.freqStart).toBeLessThan(mid.freqEnd! / mid.freqStart);
  });

  it('waveform: global omits it, explicit sets it per event', () => {
    expect(buildSirenSequence(P()).events.every((e) => e.waveform === undefined)).toBe(true);
    expect(buildSirenSequence(P({ waveform: 'sine' })).events.every((e) => e.waveform === 'sine')).toBe(true);
  });

  it('swapped min/max still sweeps the range', () => {
    const seq = buildSirenSequence(P({ minFreq: 1000, maxFreq: 200, curve: 'linear', cycles: 1 }));
    expect(seq.events[0]).toMatchObject({ freqStart: 200, freqEnd: 1000 });
  });

  it('renders without gaps (no silent stretch)', () => {
    const sr = 44100;
    const buf = renderPlayable(buildSirenSequence(P({ cycleSeconds: 0.5, cycles: 2, waveform: 'square' })), { sampleRate: sr });
    expect(buf.length).toBe(sr);
    let zeroRun = 0;
    let maxRun = 0;
    for (let i = 200; i < buf.length - 200; i++) {
      zeroRun = buf[i] === 0 ? zeroRun + 1 : 0;
      maxRun = Math.max(maxRun, zeroRun);
    }
    expect(maxRun).toBeLessThan(3);
  });
});
