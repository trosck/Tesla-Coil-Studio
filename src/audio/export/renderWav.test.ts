import { describe, expect, it } from 'vitest';
import { renderPlayable, renderWav } from './renderWav';
import type { Sequence } from '../types';

const tone: Sequence = { length: 1, events: [{ time: 0, duration: 1, freqStart: 440, gain: 1 }] };

describe('renderPlayable', () => {
  it('renders N loops of the sequence length', () => {
    expect(renderPlayable(tone, { loops: 3 }).length).toBe(44100 * 3);
  });
  it('renders an exact duration', () => {
    expect(renderPlayable(tone, { durationSeconds: 2.5 }).length).toBe(110250);
  });
  it('is continuous across loop boundaries for touching events (legato)', () => {
    // 33.3 Hz: phase at the boundary is ~0.3 cycles, far from any square edge
    const low: Sequence = { length: 1, events: [{ time: 0, duration: 1, freqStart: 33.3, gain: 1 }] };
    const buf = renderPlayable(low, { loops: 2 });
    for (let i = 44100 - 50; i < 44100 + 50; i++) expect(Math.abs(buf[i]!)).toBeGreaterThan(0.1);
  });
  it('ends silent and applies volume', () => {
    const buf = renderPlayable(tone, { loops: 1, volume: 0.5 });
    expect(Math.abs(buf[buf.length - 1]!)).toBeLessThan(0.01); // last release-ramp sample
    let peak = 0;
    for (const s of buf) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeCloseTo(0.45, 2);
  });
  it('encodes a stereo WAV', () => {
    expect(renderWav(tone, { loops: 1, stereo: true }).byteLength).toBe(44 + 44100 * 4);
  });
});
