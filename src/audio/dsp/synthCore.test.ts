import { describe, expect, it } from 'vitest';
import { DEFAULT_CEILING, SynthCore, glideFrequency, type CoreEvent } from './synthCore';

const SR = 44100;

function ev(p: Partial<CoreEvent> & { startFrame: number; endFrame: number; freqStart: number }): CoreEvent {
  return { activateFrame: p.startFrame, gain: 1, index: 0, chunk: 0, ...p };
}

function render(core: SynthCore, frames: number): Float32Array {
  const out = new Float32Array(frames);
  core.render(out);
  return out;
}

function risingCrossings(buf: Float32Array, from = 0, to = buf.length): number {
  let n = 0;
  for (let i = Math.max(1, from); i < to; i++) if (buf[i - 1]! < 0 && buf[i]! >= 0) n++;
  return n;
}

describe('glideFrequency', () => {
  it('hits endpoints exactly for every curve', () => {
    for (const c of ['linear', 'exponential', 'logarithmic'] as const) {
      expect(glideFrequency(100, 1000, 0, c)).toBeCloseTo(100, 9);
      expect(glideFrequency(100, 1000, 1, c)).toBeCloseTo(1000, 9);
    }
  });
  it('defines the midpoints', () => {
    expect(glideFrequency(100, 1000, 0.5, 'linear')).toBeCloseTo(550, 9);
    expect(glideFrequency(100, 1000, 0.5, 'exponential')).toBeCloseTo(Math.sqrt(100 * 1000), 6);
    expect(glideFrequency(100, 1000, 0.5, 'logarithmic')).toBeCloseTo(100 + 900 * Math.log10(5.5), 6);
  });
  it('clamps t to [0, 1] and works downward', () => {
    expect(glideFrequency(800, 200, 2, 'exponential')).toBeCloseTo(200, 9);
    expect(glideFrequency(800, 200, -1, 'linear')).toBe(800);
    const mid = glideFrequency(800, 200, 0.5, 'logarithmic');
    expect(mid).toBeLessThan(500); // log curve moves fast first
  });
});

describe('SynthCore', () => {
  it('renders a square wave at the requested frequency', () => {
    for (const f of [110, 440, 1234]) {
      const core = new SynthCore({ sampleRate: SR });
      core.schedule([ev({ startFrame: 0, endFrame: SR, freqStart: f })]);
      const buf = render(core, SR);
      // count over the middle part to avoid the envelope edges
      expect(Math.abs(risingCrossings(buf) - f)).toBeLessThanOrEqual(1);
    }
  });

  it('respects the duty cycle', () => {
    for (const duty of [0.1, 0.25, 0.5, 0.75]) {
      const core = new SynthCore({ sampleRate: SR, duty });
      core.schedule([ev({ startFrame: 0, endFrame: SR, freqStart: 100 })]);
      const buf = render(core, SR);
      let pos = 0;
      let total = 0;
      for (let i = 1000; i < SR - 1000; i++) {
        total++;
        if (buf[i]! > 0) pos++;
      }
      expect(pos / total).toBeCloseTo(duty, 2);
    }
  });

  it('per-event duty overrides the global duty', () => {
    const core = new SynthCore({ sampleRate: SR, duty: 0.5 });
    core.schedule([ev({ startFrame: 0, endFrame: SR, freqStart: 100, duty: 0.2 })]);
    const buf = render(core, SR);
    let pos = 0;
    for (let i = 0; i < SR; i++) if (buf[i]! > 0) pos++;
    expect(pos / SR).toBeCloseTo(0.2, 2);
  });

  it('outputs exact zeros between events and before the first one', () => {
    const core = new SynthCore({ sampleRate: SR });
    core.schedule([
      ev({ startFrame: 1000, endFrame: 5000, freqStart: 440 }),
      ev({ startFrame: 8000, endFrame: 12000, freqStart: 660 }),
    ]);
    const buf = render(core, 14000);
    for (let i = 0; i < 1000; i++) expect(buf[i]).toBe(0);
    for (let i = 5000; i < 8000; i++) expect(buf[i]).toBe(0);
    for (let i = 12000; i < 14000; i++) expect(buf[i]).toBe(0);
    expect(Math.max(...buf.slice(1000, 5000))).toBeGreaterThan(0.5);
  });

  it('never exceeds the ceiling, for any waveform', () => {
    for (const waveform of ['square', 'sine', 'triangle', 'sawtooth'] as const) {
      const core = new SynthCore({ sampleRate: SR, waveform });
      core.schedule([ev({ startFrame: 0, endFrame: SR, freqStart: 30, freqEnd: 20000, curve: 'exponential' })]);
      const buf = render(core, SR);
      let peak = 0;
      for (const s of buf) peak = Math.max(peak, Math.abs(s));
      expect(peak).toBeLessThanOrEqual(DEFAULT_CEILING + 1e-7);
      expect(peak).toBeGreaterThan(0.5);
    }
  });

  it('applies attack and release ramps (no clicks at edges)', () => {
    const core = new SynthCore({ sampleRate: SR, attackMs: 3, releaseMs: 3 });
    core.schedule([ev({ startFrame: 0, endFrame: 4410, freqStart: 100 })]);
    const buf = render(core, 4410);
    expect(Math.abs(buf[0]!)).toBeLessThan(0.01);
    expect(Math.abs(buf[4409]!)).toBeLessThan(0.01);
    expect(Math.abs(buf[2000]!)).toBeCloseTo(DEFAULT_CEILING, 5);
  });

  it('sweeps hit the end frequency (exponential)', () => {
    const core = new SynthCore({ sampleRate: SR });
    core.schedule([ev({ startFrame: 0, endFrame: SR * 2, freqStart: 200, freqEnd: 800, curve: 'exponential' })]);
    const buf = render(core, SR * 2);
    // first 100 ms ~ 200..~214 Hz, last 100 ms ~ 750..800 Hz
    const head = risingCrossings(buf, 0, SR / 10);
    const tail = risingCrossings(buf, SR * 2 - SR / 10, SR * 2);
    expect(head).toBeGreaterThanOrEqual(19);
    expect(head).toBeLessThanOrEqual(22);
    expect(tail).toBeGreaterThanOrEqual(76);
    expect(tail).toBeLessThanOrEqual(81);
  });

  it('later event wins when events overlap', () => {
    const core = new SynthCore({ sampleRate: SR });
    core.schedule([ev({ startFrame: 0, endFrame: SR, freqStart: 100 }), ev({ startFrame: SR / 2, endFrame: SR, freqStart: 1000, index: 1 })]);
    const buf = render(core, SR);
    expect(Math.abs(risingCrossings(buf, SR / 2 + 100, SR) - (1000 * (SR / 2 - 100)) / SR)).toBeLessThanOrEqual(1);
    render(core, 1);
    expect(core.getStatus().active).toBe(false);
  });

  it('plays touching events legato (no dip to zero)', () => {
    const core = new SynthCore({ sampleRate: SR, waveform: 'square' });
    core.schedule([ev({ startFrame: 0, endFrame: 1000, freqStart: 50 }), ev({ startFrame: 1000, endFrame: 2000, freqStart: 50 })]);
    const buf = render(core, 2000);
    for (let i = 900; i < 1100; i++) expect(Math.abs(buf[i]!)).toBeGreaterThan(0.8);
  });

  it('truncate cuts with a release ramp', () => {
    const core = new SynthCore({ sampleRate: SR });
    core.schedule([ev({ startFrame: 0, endFrame: SR, freqStart: 100 })]);
    render(core, 1000);
    core.truncate(1000);
    const buf = render(core, 2000);
    const rel = core.releaseLength;
    for (let i = rel; i < 2000; i++) expect(buf[i]).toBe(0);
  });

  it('noteOn/noteOff gives an immediate held tone', () => {
    const core = new SynthCore({ sampleRate: SR });
    core.noteOn(440, 1);
    const a = render(core, SR);
    expect(Math.abs(risingCrossings(a) - 440)).toBeLessThanOrEqual(1);
    expect(core.getStatus().live).toBe(true);
    core.noteOff();
    const b = render(core, 1000);
    expect(b[999]).toBe(0);
    expect(core.getStatus().active).toBe(false);
  });

  it('is deterministic', () => {
    const mk = () => {
      const c = new SynthCore({ sampleRate: SR });
      c.schedule([ev({ startFrame: 10, endFrame: 20000, freqStart: 300, freqEnd: 90, curve: 'logarithmic' })]);
      return render(c, 22000);
    };
    expect(mk()).toEqual(mk());
  });
});
