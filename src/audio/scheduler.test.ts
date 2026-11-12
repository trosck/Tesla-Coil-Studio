import { describe, expect, it } from 'vitest';
import { Scheduler, clipEvents } from './scheduler';
import type { Sequence, SequenceSource } from './types';

const SR = 1000; // 1 frame = 1 ms for readable numbers

const seq: Sequence = {
  length: 1,
  events: [
    { time: 0.5, duration: 0.25, freqStart: 200, gain: 1 },
    { time: 0, duration: 0.25, freqStart: 100, gain: 1 },
    { time: 1.5, duration: 0.1, freqStart: 999, gain: 1 }, // beyond length: ignored
  ],
};

describe('Scheduler', () => {
  it('emits events sorted with absolute frames, within the horizon only', () => {
    const s = new Scheduler(SR);
    s.start(seq, { startFrame: 100, loop: false });
    const a = s.advance(400);
    expect(a.map((e) => [e.startFrame, e.endFrame, e.freqStart, e.index])).toEqual([[100, 350, 100, 1]]);
    const b = s.advance(2000);
    expect(b.map((e) => e.startFrame)).toEqual([600]);
    expect(s.endFrame).toBe(1100);
    expect(s.advance(5000)).toEqual([]);
  });

  it('loops', () => {
    const s = new Scheduler(SR);
    s.start(seq, { startFrame: 0, loop: true });
    const evs = s.advance(3000);
    expect(evs.map((e) => e.startFrame)).toEqual([0, 500, 1000, 1500, 2000, 2500]);
    expect(evs.map((e) => e.chunk)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(s.endFrame).toBeNull();
  });

  it('respects maxChunks', () => {
    const s = new Scheduler(SR);
    s.start(seq, { startFrame: 0, loop: true, maxChunks: 2 });
    expect(s.advance(10_000)).toHaveLength(4);
    expect(s.endFrame).toBe(2000);
  });

  it('resumes mid-sequence, activating partially elapsed events at the resume frame', () => {
    const s = new Scheduler(SR);
    s.start(seq, { startFrame: 5000, loop: false, offsetSeconds: 0.6 });
    const evs = s.advance(10_000);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ startFrame: 4900, activateFrame: 5000, endFrame: 5150 });
    expect(s.positionAt(5000)?.seconds).toBeCloseTo(0.6);
  });

  it('swaps material at the next chunk boundary', () => {
    const s = new Scheduler(SR);
    s.start(seq, { startFrame: 0, loop: true });
    s.advance(500);
    s.setPlayable({ length: 0.5, events: [{ time: 0, duration: 0.1, freqStart: 300, gain: 1 }] });
    const evs = s.advance(2000);
    expect(evs.map((e) => [e.startFrame, e.freqStart])).toEqual([
      [500, 200],
      [1000, 300],
      [1500, 300],
    ]);
  });

  it('pulls successive chunks from a SequenceSource', () => {
    const src: SequenceSource = {
      kind: 'source',
      chunkCount: 3,
      chunk: (i) => ({ length: 1, events: [{ time: 0, duration: 0.5, freqStart: 100 + i, gain: 1 }] }),
    };
    const s = new Scheduler(SR);
    s.start(src, { startFrame: 0, loop: false });
    expect(s.advance(10_000).map((e) => e.freqStart)).toEqual([100, 101, 102]);
    expect(s.endFrame).toBe(3000);
  });

  it('clipEvents removes and shortens events at a cut frame', () => {
    const s = new Scheduler(SR);
    s.start(seq, { startFrame: 0, loop: true });
    const clipped = clipEvents(s.advance(3000), 1100);
    expect(clipped.map((e) => [e.startFrame, e.endFrame])).toEqual([
      [0, 250],
      [500, 750],
      [1000, 1100],
    ]);
  });

  it('turning LOOP back on before the end keeps playing', () => {
    const s = new Scheduler(SR);
    s.start(seq, { startFrame: 0, loop: false });
    s.advance(1500); // looks past the end: end is known
    expect(s.endFrame).toBe(1000);
    s.setLoop(true);
    expect(s.endFrame).toBeNull();
    const next = s.advance(1700);
    expect(next.map((e) => e.startFrame)).toEqual([1000, 1500]);
    expect(s.endFrame).toBeNull();
  });

  it('setLoop(true) does not extend past an export maxChunks limit', () => {
    const s = new Scheduler(SR);
    s.start(seq, { startFrame: 0, loop: false, maxChunks: 1 });
    s.advance(1500);
    s.setLoop(true);
    expect(s.endFrame).toBe(1000);
  });
});
