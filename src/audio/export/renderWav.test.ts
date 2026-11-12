import { describe, expect, it } from 'vitest';
import { chunksPerLoop, renderPlayable, renderWav } from './renderWav';
import type { Sequence, SequenceSource } from '../types';

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
  it('one loop of a finite multi-chunk source (e.g. a sequencer chain) is a full pass', () => {
    const a: Sequence = { length: 0.5, events: [{ time: 0, duration: 0.25, freqStart: 220, gain: 1 }] };
    const b: Sequence = { length: 1, events: [{ time: 0, duration: 0.25, freqStart: 330, gain: 1 }] };
    const chain: SequenceSource = { kind: 'source', chunk: (i) => (i % 2 === 0 ? a : b), chunkCount: 2 };
    expect(chunksPerLoop(chain)).toBe(2);
    expect(renderPlayable(chain, { loops: 2 }).length).toBe(Math.round(44100 * 3));
    const endless: SequenceSource = { kind: 'source', chunk: () => a, chunkCount: Infinity };
    expect(chunksPerLoop(endless)).toBe(1);
    expect(renderPlayable(endless, { loops: 3 }).length).toBe(Math.round(44100 * 1.5));
  });
  it('keeps silence: a gap between events renders as exact zeros', () => {
    const gap: Sequence = { length: 1, events: [{ time: 0, duration: 0.25, freqStart: 440, gain: 1 }, { time: 0.75, duration: 0.25, freqStart: 440, gain: 1 }] };
    const buf = renderPlayable(gap, { loops: 1 });
    for (let i = Math.round(44100 * 0.27); i < Math.round(44100 * 0.74); i++) expect(buf[i]).toBe(0);
    // trailing silence (length > last event) is kept too
    const tail: Sequence = { length: 2, events: [{ time: 0, duration: 0.5, freqStart: 440, gain: 1 }] };
    const t = renderPlayable(tail, { loops: 1 });
    expect(t.length).toBe(88200);
    expect(t[88199]).toBe(0);
  });
  it('per-event waveform overrides the global waveform', () => {
    const sine: Sequence = { length: 0.1, events: [{ time: 0, duration: 0.1, freqStart: 100, gain: 1, waveform: 'sine' }] };
    const buf = renderPlayable(sine, { loops: 1, waveform: 'square' });
    // a sine passes through small values; a square never sits between ±0.5 away from the edges
    let mid = 0;
    for (let i = 500; i < 4000; i++) if (Math.abs(buf[i]!) < 0.4) mid++;
    expect(mid).toBeGreaterThan(500);
  });
});
