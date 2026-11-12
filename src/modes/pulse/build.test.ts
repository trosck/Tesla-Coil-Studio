import { describe, expect, it } from 'vitest';
import { renderPlayable } from '../../audio/export/renderWav';
import { isSequenceSource, type Sequence } from '../../audio/types';
import { PULSE_PATTERNS, buildPulsePlayable, defaultPulseParams, normalizePulseParams, parsePattern, pulseTiming, type PulseParams } from './build';

const P = (over: Partial<PulseParams> = {}): PulseParams => ({ ...defaultPulseParams, ...over });

function asSeq(p: PulseParams): Sequence {
  const out = buildPulsePlayable(p);
  if (!out) throw new Error('null');
  return isSequenceSource(out) ? out.chunk(0) : out;
}

describe('pulse normalize', () => {
  it('defaults for garbage and clamps', () => {
    expect(normalizePulseParams(undefined)).toEqual(defaultPulseParams);
    const p = normalizePulseParams({ bpm: 5000, pulseMs: -1, pattern: 'nope', repetitions: 3.4, customSteps: 12, custom: [2, 9, 'x', 1] });
    expect(p.bpm).toBe(300);
    expect(p.pulseMs).toBe(1);
    expect(p.pattern).toBe(defaultPulseParams.pattern);
    expect(p.repetitions).toBe(3);
    expect(p.customSteps).toBe(16);
    expect(p.custom).toHaveLength(16);
    expect(p.custom.slice(0, 5)).toEqual([2, 2, 0, 1, 0]);
  });
  it('all built-in patterns have whole bars of 16 steps', () => {
    for (const pt of PULSE_PATTERNS) expect(pt.steps.length % 16).toBe(0);
  });
});

describe('pulse build', () => {
  it('places pulses on the BPM grid with the gate as duration', () => {
    const seq = asSeq(P({ bpm: 120, pattern: 'quarters', pulseMs: 40 }));
    // 120 BPM, 16th steps = 125 ms; quarters on steps 0,4,8,12
    expect(seq.events.map((e) => e.time)).toEqual([0, 0.5, 1, 1.5]);
    expect(seq.events.every((e) => e.duration === 0.04)).toBe(true);
    expect(seq.length).toBeCloseTo(2);
    expect(seq.bpm).toBe(120);
    expect(seq.events.map((e) => e.step)).toEqual([0, 4, 8, 12]);
  });

  it('accents are louder than normal pulses', () => {
    const seq = asSeq(P({ pattern: 'quarters', gain: 1, accent: 0.5 }));
    expect(seq.events.map((e) => e.gain)).toEqual([1, 0.5, 0.5, 0.5]);
  });

  it('limits the gate to 90% of a step', () => {
    const t = pulseTiming(P({ bpm: 120, pulseMs: 500, pattern: 'sixteenths' }));
    expect(t.gateLimited).toBe(true);
    expect(t.gate).toBeCloseTo(0.1125);
    const seq = asSeq(P({ bpm: 120, pulseMs: 500, pattern: 'sixteenths' }));
    for (let i = 1; i < seq.events.length; i++) {
      const a = seq.events[i - 1]!;
      expect(seq.events[i]!.time).toBeGreaterThan(a.time + a.duration);
    }
  });

  it('pause adds silence after every repetition', () => {
    const seq = asSeq(P({ pattern: 'quarters', bpm: 120, pauseSeconds: 1, repetitions: 2 }));
    expect(seq.length).toBeCloseTo(6);
    expect(seq.events).toHaveLength(8);
    expect(seq.events[4]!.time).toBeCloseTo(3);
  });

  it('repetitions 0 = endless source; N = plain sequence', () => {
    const endless = buildPulsePlayable(P({ repetitions: 0 }))!;
    expect(isSequenceSource(endless)).toBe(true);
    expect(isSequenceSource(endless) && endless.chunkCount).toBe(Infinity);
    expect(isSequenceSource(buildPulsePlayable(P({ repetitions: 3 }))!)).toBe(false);
  });

  it('custom 8-step pattern uses 8th notes', () => {
    const custom = [...parsePattern('X.x.x.xx'), ...parsePattern('........')];
    const seq = asSeq(P({ pattern: 'custom', customSteps: 8, custom, bpm: 60 }));
    expect(seq.length).toBeCloseTo(4);
    expect(seq.events.map((e) => e.time)).toEqual([0, 1, 2, 3, 3.5]);
  });

  it('empty custom pattern disables playback', () => {
    expect(buildPulsePlayable(P({ pattern: 'custom', custom: Array(16).fill(0) }))).toBeNull();
  });

  it('renders the pulse frequency during pulses and silence between', () => {
    const sr = 44100;
    const buf = renderPlayable(buildPulsePlayable(P({ pattern: 'quarters', bpm: 120, pulseMs: 100, frequency: 500, repetitions: 1 }))!, { sampleRate: sr });
    expect(buf.length).toBe(2 * sr);
    let rising = 0;
    for (let i = 1; i < 0.1 * sr; i++) if (buf[i - 1]! < 0 && buf[i]! >= 0) rising++;
    expect(Math.abs(rising - 50)).toBeLessThanOrEqual(1);
    // silence between pulses
    for (let i = Math.round(0.2 * sr); i < Math.round(0.45 * sr); i++) expect(buf[i]).toBe(0);
  });
});
