import { describe, expect, it } from 'vitest';
import { renderPlayable } from '../../audio/export/renderWav';
import {
  buildFrequency,
  buildSteady,
  defaultFrequencyParams,
  freqToSliderPos,
  normalizeFrequencyParams,
  roundFreq,
  sliderPosToFreq,
  type FrequencyParams,
} from './build';

const params = (over: Partial<FrequencyParams>): FrequencyParams => ({ ...defaultFrequencyParams, ...over });

function risingZeroCrossings(buf: Float32Array, from = 0, to = buf.length): number {
  let n = 0;
  for (let i = Math.max(1, from); i < to; i++) if (buf[i - 1]! < 0 && buf[i]! >= 0) n++;
  return n;
}

describe('frequency normalize', () => {
  it('normalizes bad input', () => {
    const p = normalizeFrequencyParams({ frequency: 'x', gain: 5 });
    expect(p.frequency).toBe(440);
    expect(p.gain).toBe(1);
    expect(normalizeFrequencyParams(null)).toEqual(defaultFrequencyParams);
  });

  it('keeps legacy { frequency, gain } params working as a steady tone', () => {
    const p = normalizeFrequencyParams({ frequency: 120, gain: 0.8 });
    expect(p).toEqual({ ...defaultFrequencyParams, frequency: 120, gain: 0.8 });
    expect(buildFrequency(p)!.events).toEqual([{ time: 0, duration: 1, freqStart: 120, gain: 0.8 }]);
  });

  it('validates nested sweep / steps and slider bounds', () => {
    const p = normalizeFrequencyParams({
      subMode: 'sweep',
      sliderMin: 3000,
      sliderMax: 100,
      sweep: { from: -5, to: 99999, duration: 0, curve: 'zigzag' },
      steps: [{ id: 'a', frequency: 50, duration: 2, gap: -1 }, { id: 'a', frequency: 60 }, { frequency: 'bad' }, null],
    });
    expect(p.subMode).toBe('sweep');
    expect(p.sliderMin).toBe(3000);
    expect(p.sliderMax).toBe(6000);
    expect(p.sweep).toEqual({ from: 1, to: 20000, duration: 0.01, curve: 'exponential' });
    expect(p.steps).toEqual([
      { id: 'a', frequency: 50, duration: 2, gap: 0 },
      { id: 'ax', frequency: 60, duration: 0.5, gap: 0 },
    ]);
    expect(normalizeFrequencyParams({ subMode: 'nope' }).subMode).toBe('steady');
  });

  it('round-trips valid params', () => {
    const p = params({ subMode: 'sequence', sliderMin: 30, sliderMax: 3000, steps: [{ id: 'x', frequency: 100, duration: 1, gap: 0.2 }] });
    expect(normalizeFrequencyParams(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});

describe('frequency build', () => {
  it('builds a seamless looping steady tone', () => {
    const seq = buildSteady({ frequency: 200, gain: 1 });
    const buf = renderPlayable(seq, { loops: 3 });
    expect(Math.abs(risingZeroCrossings(buf) - 600)).toBeLessThanOrEqual(1);
  });

  it('builds a sweep as one glide event', () => {
    const seq = buildFrequency(params({ subMode: 'sweep', gain: 0.5, sweep: { from: 100, to: 400, duration: 2, curve: 'linear' } }))!;
    expect(seq.length).toBe(2);
    expect(seq.events).toEqual([{ time: 0, duration: 2, freqStart: 100, freqEnd: 400, curve: 'linear', gain: 0.5 }]);
    // linear 100 -> 400 Hz over 2 s = 500 cycles
    const buf = renderPlayable(seq, { loops: 1 });
    expect(Math.abs(risingZeroCrossings(buf) - 500)).toBeLessThanOrEqual(2);
  });

  it('builds a step sequence with gaps and step indices', () => {
    const seq = buildFrequency(
      params({
        subMode: 'sequence',
        gain: 1,
        steps: [
          { id: 'a', frequency: 100, duration: 0.5, gap: 0.25 },
          { id: 'b', frequency: 200, duration: 1, gap: 0 },
        ],
      }),
    )!;
    expect(seq.length).toBe(1.75);
    expect(seq.events).toEqual([
      { time: 0, duration: 0.5, freqStart: 100, gain: 1, step: 0 },
      { time: 0.75, duration: 1, freqStart: 200, gain: 1, step: 1 },
    ]);
    const sr = 44100;
    const buf = renderPlayable(seq, { loops: 1, sampleRate: sr });
    // silence in the gap
    const gap = buf.subarray(Math.round(0.55 * sr), Math.round(0.7 * sr));
    expect(Math.max(...Array.from(gap, Math.abs))).toBe(0);
    expect(Math.abs(risingZeroCrossings(buf, Math.round(0.75 * sr)) - 200)).toBeLessThanOrEqual(1);
  });

  it('empty sequence is not playable', () => {
    expect(buildFrequency(params({ subMode: 'sequence', steps: [] }))).toBeNull();
  });
});

describe('log slider mapping', () => {
  it('maps both ways and clamps', () => {
    expect(freqToSliderPos(20, 20, 20000)).toBe(0);
    expect(freqToSliderPos(20000, 20, 20000)).toBe(1);
    expect(freqToSliderPos(632.455532, 20, 20000)).toBeCloseTo(0.5, 5);
    expect(sliderPosToFreq(0.5, 20, 20000)).toBeCloseTo(632.4555, 3);
    expect(freqToSliderPos(5, 20, 20000)).toBe(0);
    expect(roundFreq(1234.56)).toBe(1235);
    expect(roundFreq(123.456)).toBe(123.5);
    expect(roundFreq(12.3456)).toBe(12.35);
  });
});
