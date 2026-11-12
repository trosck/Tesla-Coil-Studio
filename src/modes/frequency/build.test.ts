import { describe, expect, it } from 'vitest';
import { renderPlayable } from '../../audio/export/renderWav';
import { buildFrequencySequence, normalizeFrequencyParams } from './build';

describe('frequency mode', () => {
  it('normalizes bad input', () => {
    expect(normalizeFrequencyParams({ frequency: 'x', gain: 5 })).toEqual({ frequency: 440, gain: 1 });
    expect(normalizeFrequencyParams(null)).toEqual({ frequency: 440, gain: 0.8 });
  });
  it('builds a seamless looping tone', () => {
    const seq = buildFrequencySequence({ frequency: 200, gain: 1 });
    const buf = renderPlayable(seq, { loops: 3 });
    let rising = 0;
    for (let i = 1; i < buf.length; i++) if (buf[i - 1]! < 0 && buf[i]! >= 0) rising++;
    expect(Math.abs(rising - 600)).toBeLessThanOrEqual(1);
  });
});
