import { describe, expect, it } from 'vitest';
import { renderPlayable } from '../../audio/export/renderWav';
import { buildRampSequence, curveAt, defaultRampParams, normalizeRampParams, type RampParams } from './build';
import { sampleTrajectory } from './trajectory';

const P = (over: Partial<RampParams> = {}): RampParams => ({ ...defaultRampParams, ...over });

function risingCrossings(buf: Float32Array, from = 0, to = buf.length): number {
  let n = 0;
  for (let i = Math.max(1, from); i < to; i++) if (buf[i - 1]! < 0 && buf[i]! >= 0) n++;
  return n;
}

describe('ramp normalize', () => {
  it('falls back to defaults for garbage', () => {
    expect(normalizeRampParams(null)).toEqual(defaultRampParams);
    expect(normalizeRampParams('x')).toEqual(defaultRampParams);
    expect(normalizeRampParams([1, 2])).toEqual(defaultRampParams);
  });
  it('clamps and validates fields', () => {
    const p = normalizeRampParams({ startFreq: -5, endFreq: 1e9, duration: 0, curve: 'weird', steps: 7.6, repeats: 1000, gain: 3, upDown: 'yes', stepStyle: 'glide' });
    expect(p.startFreq).toBe(1);
    expect(p.endFreq).toBe(20000);
    expect(p.duration).toBe(0.05);
    expect(p.curve).toBe(defaultRampParams.curve);
    expect(p.steps).toBe(8);
    expect(p.repeats).toBe(64);
    expect(p.gain).toBe(1);
    expect(p.upDown).toBe(defaultRampParams.upDown);
    expect(p.stepStyle).toBe('glide');
  });
});

describe('ramp build', () => {
  it('default: one glide plus trailing pause', () => {
    const seq = buildRampSequence(defaultRampParams);
    expect(seq.events).toHaveLength(1);
    expect(seq.events[0]).toMatchObject({ time: 0, duration: 2, freqStart: 100, freqEnd: 1000, curve: 'exponential' });
    expect(seq.length).toBeCloseTo(2.5);
  });

  it('pauses and repeats lay out the timeline', () => {
    const seq = buildRampSequence(P({ pauseBefore: 0.25, pauseAfter: 0.25, repeats: 3, duration: 1 }));
    expect(seq.events.map((e) => e.time)).toEqual([0.25, 1.75, 3.25]);
    expect(seq.length).toBeCloseTo(4.5);
  });

  it('up-down adds a touching return leg', () => {
    const seq = buildRampSequence(P({ upDown: true, duration: 1, pauseAfter: 0 }));
    expect(seq.events).toHaveLength(2);
    const [a, b] = seq.events;
    expect(a!.time + a!.duration).toBe(b!.time);
    expect(b).toMatchObject({ freqStart: 1000, freqEnd: 100 });
    expect(seq.length).toBe(2);
  });

  it('hold staircase hits both endpoints with gaps between segments', () => {
    const seq = buildRampSequence(P({ steps: 4, stepStyle: 'hold', stepGap: 0.05, duration: 2, curve: 'linear' }));
    expect(seq.events).toHaveLength(4);
    expect(seq.events[0]!.freqStart).toBeCloseTo(100);
    expect(seq.events[3]!.freqStart).toBeCloseTo(1000);
    expect(seq.events[1]!.freqStart).toBeCloseTo(400);
    for (let i = 0; i < 3; i++) {
      const e = seq.events[i]!;
      expect(seq.events[i + 1]!.time - (e.time + e.duration)).toBeCloseTo(0.05);
    }
    expect(seq.events.every((e) => e.freqEnd === undefined)).toBe(true);
  });

  it('chopped glide slices follow the overall curve', () => {
    const seq = buildRampSequence(P({ steps: 2, stepStyle: 'glide', curve: 'exponential' }));
    expect(seq.events).toHaveLength(2);
    expect(seq.events[0]!.freqEnd).toBeCloseTo(curveAt(100, 1000, 0.5, 'exponential'));
    expect(seq.events[1]!.freqStart).toBeCloseTo(seq.events[0]!.freqEnd!);
  });

  it('logarithmic slices become legato linear pieces', () => {
    const seq = buildRampSequence(P({ steps: 2, stepStyle: 'glide', curve: 'logarithmic', stepGap: 0.1 }));
    expect(seq.events.length).toBeGreaterThan(2);
    const lines = sampleTrajectory(seq);
    expect(lines).toHaveLength(2); // two audible segments separated by one gap
  });

  it('renders a rising pitch (more cycles in the second half)', () => {
    const seq = buildRampSequence(P({ startFreq: 100, endFreq: 1000, duration: 1, curve: 'linear', pauseAfter: 0 }));
    const sr = 44100;
    const buf = renderPlayable(seq, { sampleRate: sr });
    expect(buf.length).toBe(sr);
    const first = risingCrossings(buf, 0, sr / 2);
    const second = risingCrossings(buf, sr / 2, sr);
    // linear 100->550 Hz over 0.5 s = ~162 cycles; 550->1000 = ~387 cycles
    expect(Math.abs(first - 162)).toBeLessThanOrEqual(3);
    expect(Math.abs(second - 387)).toBeLessThanOrEqual(3);
  });

  it('is pure and deterministic', () => {
    const p = P({ steps: 5, upDown: true, repeats: 2 });
    expect(buildRampSequence(p)).toEqual(buildRampSequence(p));
  });
});
