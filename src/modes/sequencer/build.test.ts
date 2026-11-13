import { describe, expect, it } from 'vitest';
import { renderPlayable } from '../../audio/export/renderWav';
import { midiToFreq } from '../../audio/music';
import { isSequenceSource, type Sequence } from '../../audio/types';
import {
  MAX_STEPS,
  SLOT_COUNT,
  buildPatternSequence,
  buildSequencer,
  defaultSequencerParams,
  emptyPattern,
  normalizeSequencerParams,
  patternSeconds,
  normalizeStep,
  restStep,
  seqStepSeconds,
  slotForChunk,
  snapLength,
  stepAtPosition,
  stepTime,
  type SeqPattern,
  type SequencerParams,
  type StepCount,
  type StepLength,
} from './build';

function pattern(cells: Array<[number, number, StepLength, number]>, steps: StepCount = 16): SeqPattern {
  const p = emptyPattern(steps);
  for (const [i, midi, length, velocity] of cells) p.notes[i] = { on: true, muted: false, midi, length, velocity };
  return p;
}

describe('snapLength', () => {
  it('snaps to 0.5 or 1', () => {
    expect(snapLength(0)).toBe(0.5);
    expect(snapLength(0.4)).toBe(0.5);
    expect(snapLength(0.74)).toBe(0.5);
    expect(snapLength(0.75)).toBe(1);
    expect(snapLength(1.75)).toBe(1);
    expect(snapLength(4)).toBe(1);
    expect(snapLength(NaN)).toBe(1);
    expect(snapLength(Infinity)).toBe(1);
  });
});

const SR = 44100;

describe('sequencer timing', () => {
  it('steps are 16th notes at the given BPM', () => {
    expect(seqStepSeconds(120)).toBeCloseTo(0.125, 12);
    const seq = buildPatternSequence(pattern([[0, 60, 0.5, 1], [4, 62, 0.5, 1], [5, 64, 0.5, 1]]), 120, 0);
    expect(seq.events.map((e) => e.time)).toEqual([0, 0.5, 0.625]);
    expect(seq.events.map((e) => e.step)).toEqual([0, 4, 5]);
    expect(seq.events[1]!.freqStart).toBeCloseTo(midiToFreq(62), 9);
    expect(seq.bpm).toBe(120);
  });

  it('sequence length is exactly steps * stepSeconds', () => {
    expect(buildPatternSequence(emptyPattern(16), 120, 0).length).toBe(16 * 0.125);
    expect(buildPatternSequence(emptyPattern(32), 90, 0.5).length).toBeCloseTo(32 * (60 / 90 / 4), 12);
    expect(patternSeconds(16, 128)).toBeCloseTo(16 * (60 / 128 / 4), 12);
  });

  it('swing delays only odd steps by swing * step', () => {
    const p = pattern([[0, 60, 0.5, 1], [1, 60, 0.5, 1], [2, 60, 0.5, 1], [3, 60, 0.5, 1]]);
    const seq = buildPatternSequence(p, 120, 0.5);
    expect(seq.events.map((e) => e.time)).toEqual([0, 0.1875, 0.25, 0.4375]);
    expect(stepTime(7, 120, 0.75)).toBeCloseTo((7 + 0.75) * 0.125, 12);
    expect(stepTime(6, 120, 0.75)).toBeCloseTo(6 * 0.125, 12);
  });

  it('lengths map to gate durations, never past the loop end', () => {
    const p = pattern([[0, 60, 0.5, 1], [2, 60, 1, 1], [15, 60, 1, 1]]);
    const seq = buildPatternSequence(p, 120, 0);
    expect(seq.events[0]!.duration).toBeCloseTo(0.5 * 0.125, 12);
    expect(seq.events[1]!.duration).toBeCloseTo(0.125, 12);
    const last = seq.events[2]!;
    expect(last.time + last.duration).toBeCloseTo(seq.length, 12);
  });

  it('muted steps are skipped; a length-1 note before a muted step plays its full step', () => {
    const p = pattern([[0, 60, 1, 1], [1, 62, 1, 1], [2, 64, 0.5, 1]]);
    p.notes[1]!.muted = true;
    const seq = buildPatternSequence(p, 120, 0);
    expect(seq.events.map((e) => e.step)).toEqual([0, 2]);
    expect(seq.events[0]!.duration).toBeCloseTo(0.125, 12);
  });

  it('a length-1 note touches the next note (legato tie); default gate articulates', () => {
    const tied = buildPatternSequence(pattern([[0, 60, 1, 1], [1, 60, 1, 1]]), 120, 0);
    expect(tied.events[0]!.time + tied.events[0]!.duration).toBeCloseTo(tied.events[1]!.time, 12);
    const art = buildPatternSequence(pattern([[0, 60, 0.5, 1], [1, 60, 0.5, 1]]), 120, 0);
    expect(art.events[0]!.time + art.events[0]!.duration).toBeLessThan(art.events[1]!.time);
  });

  it('velocity becomes gain, rests and zero velocity produce no event', () => {
    const p = pattern([[0, 60, 0.5, 0.3], [1, 60, 0.5, 0], [2, 60, 0.5, 1]]);
    p.notes[3] = { on: false, muted: false, midi: 60, length: 0.5, velocity: 1 };
    const seq = buildPatternSequence(p, 120, 0);
    expect(seq.events.map((e) => e.gain)).toEqual([0.3, 1]);
    expect(seq.events.map((e) => e.step)).toEqual([0, 2]);
  });

  it('rests render as exact silence', () => {
    // note on step 0 (gate 0.5), rest on steps 1..15
    const seq = buildPatternSequence(pattern([[0, 57, 0.5, 1]]), 120, 0);
    const buf = renderPlayable(seq, { loops: 1, sampleRate: SR });
    expect(buf.length).toBe(Math.round(seq.length * SR));
    const from = Math.round(0.0625 * SR) + 10;
    let maxRest = 0;
    for (let i = from; i < buf.length; i++) maxRest = Math.max(maxRest, Math.abs(buf[i]!));
    expect(maxRest).toBe(0);
    let maxNote = 0;
    for (let i = 0; i < from - 10; i++) maxNote = Math.max(maxNote, Math.abs(buf[i]!));
    expect(maxNote).toBeGreaterThan(0.5);
  });

  it('velocity scales the rendered amplitude', () => {
    const peak = (v: number) => {
      const buf = renderPlayable(buildPatternSequence(pattern([[0, 57, 1, v]]), 120, 0), { sampleRate: SR });
      let m = 0;
      for (const x of buf) m = Math.max(m, Math.abs(x));
      return m;
    };
    expect(peak(0.5) / peak(1)).toBeCloseTo(0.5, 2);
  });

  it('loops seamlessly: two loops render twice the length', () => {
    const seq = buildSequencer(defaultSequencerParams) as Sequence;
    const buf = renderPlayable(seq, { loops: 2, sampleRate: SR });
    expect(buf.length).toBe(2 * Math.round(seq.length * SR));
  });
});

describe('playhead', () => {
  it('derives the step from position, including held steps', () => {
    expect(stepAtPosition(0, 120, 0, 16)).toBe(0);
    expect(stepAtPosition(0.124, 120, 0, 16)).toBe(0);
    expect(stepAtPosition(0.125, 120, 0, 16)).toBe(1);
    expect(stepAtPosition(1.999, 120, 0, 16)).toBe(15);
    expect(stepAtPosition(2, 120, 0, 16)).toBe(15);
  });
  it('accounts for swing', () => {
    // step 1 starts at 1.5 * 0.125 with 50% swing
    expect(stepAtPosition(0.18, 120, 0.5, 16)).toBe(0);
    expect(stepAtPosition(0.1875, 120, 0.5, 16)).toBe(1);
    expect(stepAtPosition(0.25, 120, 0.5, 16)).toBe(2);
  });
  it('rejects bad input', () => {
    expect(stepAtPosition(NaN, 120, 0, 16)).toBe(-1);
    expect(stepAtPosition(0, 0, 0, 16)).toBe(-1);
  });
});

describe('buildSequencer', () => {
  it('plays the current slot', () => {
    const p: SequencerParams = { ...defaultSequencerParams, current: 1 };
    const seq = buildSequencer(p) as Sequence;
    expect(isSequenceSource(seq)).toBe(false);
    expect(seq.label).toBe('sequencer-B-128bpm');
    expect(seq.events.length).toBe(defaultSequencerParams.patterns[1]!.notes.slice(0, 16).filter((s) => s.on).length);
  });
  it('empty pattern is a silent but playable loop', () => {
    const p: SequencerParams = { ...defaultSequencerParams, current: 3 };
    const seq = buildSequencer(p) as Sequence;
    expect(seq.events).toEqual([]);
    expect(seq.length).toBeCloseTo(16 * seqStepSeconds(128), 12);
  });
  it('chain plays enabled slots in order as a source', () => {
    const p: SequencerParams = { ...defaultSequencerParams, chain: true, chainSlots: [true, false, true, false] };
    const src = buildSequencer(p);
    expect(src && isSequenceSource(src)).toBe(true);
    if (!src || !isSequenceSource(src)) return;
    expect(src.chunkCount).toBe(2);
    expect(src.chunk(0).events.length).toBeGreaterThan(0);
    expect(src.chunk(1).events.length).toBe(0);
    expect(src.chunk(2)).toBe(src.chunk(0));
    expect(slotForChunk(p, 0)).toBe(0);
    expect(slotForChunk(p, 1)).toBe(2);
    expect(slotForChunk(p, 3)).toBe(2);
  });
  it('chain with no enabled slots falls back to the current slot', () => {
    const p: SequencerParams = { ...defaultSequencerParams, chain: true, chainSlots: [false, false, false, false], current: 1 };
    const seq = buildSequencer(p);
    expect(seq && !isSequenceSource(seq)).toBe(true);
    expect(slotForChunk(p, 5)).toBe(1);
  });
  it('default pattern is a busy 16-step loop with articulated notes', () => {
    const seq = buildSequencer(defaultSequencerParams) as Sequence;
    expect(seq.events.length).toBeGreaterThanOrEqual(10);
    expect(seq.loop).toBe(true);
  });
});

describe('normalizeSequencerParams', () => {
  it('returns defaults for garbage', () => {
    expect(normalizeSequencerParams(null)).toEqual(defaultSequencerParams);
    expect(normalizeSequencerParams('x')).toEqual(defaultSequencerParams);
    expect(normalizeSequencerParams([])).toEqual(defaultSequencerParams);
  });
  it('is idempotent on defaults and does not share references', () => {
    const n = normalizeSequencerParams(defaultSequencerParams);
    expect(n).toEqual(defaultSequencerParams);
    expect(n.patterns[0]).not.toBe(defaultSequencerParams.patterns[0]);
  });
  it('clamps and repairs fields', () => {
    const n = normalizeSequencerParams({
      bpm: 9999,
      swing: -1,
      gate: 7,
      root: 14,
      scale: 'nope',
      octave: 2.6,
      range: 5,
      density: 'x',
      current: 9,
      chain: 'yes',
      chainSlots: [false, 'x'],
      patterns: [
        { steps: 32, notes: [{ on: true, midi: 500, length: 99, velocity: 3 }, 'bad', { on: 1, midi: 61.4 }] },
        'broken',
      ],
    });
    expect(n.bpm).toBe(300);
    expect(n.swing).toBe(0);
    expect(n.gate).toBe(1);
    expect(n.root).toBe(2);
    expect(n.scale).toBe(defaultSequencerParams.scale);
    expect(n.octave).toBe(3);
    expect(n.range).toBe(defaultSequencerParams.range);
    expect(n.density).toBe(defaultSequencerParams.density);
    expect(n.current).toBe(SLOT_COUNT - 1);
    expect(n.chain).toBe(false);
    expect(n.chainSlots).toHaveLength(SLOT_COUNT);
    expect(n.chainSlots[0]).toBe(false);
    expect(n.patterns).toHaveLength(SLOT_COUNT);
    const p0 = n.patterns[0]!;
    expect(p0.steps).toBe(32);
    expect(p0.notes).toHaveLength(MAX_STEPS);
    expect(p0.notes[0]).toEqual({ on: true, muted: false, midi: 108, length: 1, velocity: 1 });
    expect(p0.notes[1]!.on).toBe(false);
    expect(p0.notes[2]!.on).toBe(false);
    expect(p0.notes[2]!.midi).toBe(61);
    expect(n.patterns[1]!.notes.every((s) => !s.on)).toBe(true);
    expect(n.patterns[1]!.steps).toBe(16);
    // builds without throwing
    expect(buildSequencer(n)).not.toBeNull();
  });
  it('normalizes muted (default false) and snaps lengths', () => {
    const fb = restStep();
    expect(normalizeStep({ on: true, midi: 60 }, fb).muted).toBe(false);
    expect(normalizeStep({ muted: 'yes' }, fb).muted).toBe(false);
    expect(normalizeStep({ muted: true }, fb).muted).toBe(true);
    expect(normalizeStep({ length: 0.3 }, fb).length).toBe(0.5);
    expect(normalizeStep({ length: 'x' }, fb).length).toBe(fb.length);
    expect(normalizeSequencerParams({ gate: 0.25 }).gate).toBe(0.5);
    expect(normalizeSequencerParams({ gate: 'x' }).gate).toBe(1);
    const lens = defaultSequencerParams.patterns.flatMap((p) => p.notes.map((s) => s.length));
    expect(lens.every((l) => l === 0.5 || l === 1)).toBe(true);
  });
  it('accepts 4/8/16/32 step counts and rejects others', () => {
    const steps = (v: unknown) => normalizeSequencerParams({ patterns: [{ steps: v }] }).patterns[0]!.steps;
    for (const v of [4, 8, 16, 32]) expect(steps(v)).toBe(v);
    for (const v of [0, 5, 12, 64, '8', null]) expect(steps(v)).toBe(16);
  });
});
