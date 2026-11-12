import { describe, expect, it } from 'vitest';
import { SCALES, midiToFreq } from '../../audio/music';
import { buildMelody, defaultMelodyParams, durationBeats, formatBeats, normalizeMelodyParams, type MelodyParams } from './build';
import { KEY_TO_SEMITONE, insertNote, isBlackKey, moveNote, octaveBaseMidi, removeNote, stepPitch, updateNote } from './edit';

const params = (over: Partial<MelodyParams>): MelodyParams => ({ ...defaultMelodyParams, ...over });

describe('melody build', () => {
  it('default demo melody builds immediately', () => {
    const seq = buildMelody(defaultMelodyParams)!;
    expect(seq).not.toBeNull();
    expect(seq.events.length).toBe(defaultMelodyParams.notes.length);
    expect(seq.bpm).toBe(120);
    expect(seq.length).toBeCloseTo(16 * 0.5); // 16 beats at 120 BPM
  });

  it('converts beats to seconds, applies the gate and skips rests', () => {
    const seq = buildMelody(
      params({
        bpm: 60,
        gate: 50,
        gain: 0.5,
        notes: [
          { midi: 60, beats: 1 },
          { midi: null, beats: 0.5 },
          { midi: 69, beats: 2 },
        ],
      }),
    )!;
    expect(seq.length).toBeCloseTo(3.5);
    expect(seq.events).toEqual([
      { time: 0, duration: 0.5, freqStart: midiToFreq(60), gain: 0.5, step: 0 },
      { time: 1.5, duration: 1, freqStart: 440, gain: 0.5, step: 2 },
    ]);
  });

  it('gate < 100 leaves a gap between repeated notes; 100 is legato', () => {
    const notes = [
      { midi: 64, beats: 1 },
      { midi: 64, beats: 1 },
    ];
    const gapped = buildMelody(params({ notes, gate: 90 }))!;
    const e0 = gapped.events[0]!;
    expect(e0.time + e0.duration).toBeLessThan(gapped.events[1]!.time);
    const legato = buildMelody(params({ notes, gate: 100 }))!;
    const l0 = legato.events[0]!;
    expect(l0.time + l0.duration).toBeCloseTo(legato.events[1]!.time);
  });

  it('returns null when there is nothing to play', () => {
    expect(buildMelody(params({ notes: [] }))).toBeNull();
    expect(buildMelody(params({ notes: [{ midi: null, beats: 1 }] }))).toBeNull();
  });
});

describe('melody normalize', () => {
  it('falls back to defaults for garbage', () => {
    expect(normalizeMelodyParams(null)).toEqual(defaultMelodyParams);
    expect(normalizeMelodyParams('x')).toEqual(defaultMelodyParams);
  });
  it('clamps and filters', () => {
    const p = normalizeMelodyParams({
      notes: [{ midi: 200, beats: 1 }, { midi: null, beats: 100 }, { midi: 'C4', beats: 1 }, { beats: 'x' }, 5, { midi: 60.4, beats: 0.5 }],
      bpm: 9999,
      gate: 0,
      duration: 'nope',
      scale: 'jazz',
      snapToScale: 'yes',
      octave: 99,
      gain: -1,
    });
    expect(p.notes).toEqual([
      { midi: 108, beats: 1 },
      { midi: null, beats: 16 },
      { midi: 60, beats: 0.5 },
    ]);
    expect(p.bpm).toBe(300);
    expect(p.gate).toBe(10);
    expect(p.duration).toBe('quarter');
    expect(p.scale).toBe('c-major');
    expect(p.snapToScale).toBe(false);
    expect(p.octave).toBe(5);
    expect(p.gain).toBe(0);
  });
  it('keeps valid params (round trip)', () => {
    const p = params({ scale: 'd-minor', duration: 'eighth-triplet', snapToScale: true, octave: 3, notes: [{ midi: 62, beats: 1 / 3 }] });
    expect(normalizeMelodyParams(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});

describe('melody durations', () => {
  it('maps ids to beats', () => {
    expect(durationBeats('whole')).toBe(4);
    expect(durationBeats('dotted-quarter')).toBe(1.5);
    expect(durationBeats('eighth-triplet')).toBeCloseTo(1 / 3);
    expect(formatBeats(0.25)).toBe('1/16');
    expect(formatBeats(1.25)).toBe('1.25 b');
  });
});

describe('melody editing helpers', () => {
  const a = { midi: 60, beats: 1 };
  const b = { midi: 62, beats: 1 };
  const c = { midi: 64, beats: 1 };
  it('insert / remove / update / move', () => {
    expect(insertNote([a, c], 1, b)).toEqual([a, b, c]);
    expect(insertNote([a], 99, b)).toEqual([a, b]);
    expect(removeNote([a, b, c], 1)).toEqual([a, c]);
    expect(removeNote([a], 5)).toEqual([a]);
    expect(updateNote([a, b], 1, { beats: 2 })).toEqual([a, { midi: 62, beats: 2 }]);
    expect(moveNote([a, b, c], 0, 1)).toEqual([b, a, c]);
    expect(moveNote([a, b, c], 0, -1)).toEqual([a, b, c]);
  });
  it('steps pitch chromatically or within a scale', () => {
    expect(stepPitch(60, 1, null)).toBe(61);
    expect(stepPitch(64, 1, SCALES['c-major'])).toBe(65);
    expect(stepPitch(60, -1, SCALES.pentatonic)).toBe(57);
    expect(stepPitch(108, 1, null)).toBe(108);
  });
  it('keyboard mapping', () => {
    expect(KEY_TO_SEMITONE.KeyA).toBe(0);
    expect(KEY_TO_SEMITONE.KeyK).toBe(12);
    expect(octaveBaseMidi(4)).toBe(60);
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(64)).toBe(false);
    for (const semi of Object.values(KEY_TO_SEMITONE)) expect(semi >= 0 && semi < 18).toBe(true);
  });
});
