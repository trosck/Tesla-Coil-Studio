import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { renderPlayable } from '../../audio/export/renderWav';
import { midiToFreq } from '../../audio/music';
import {
  applyDurations,
  bestOctaveShift,
  convertMidi,
  defaultMidiParams,
  defaultTrackSelection,
  fitMidi,
  midiRange,
  normalizeMidiParams,
  speedFactor,
  TAIL_SECONDS,
  trimNotes,
} from './convert';
import { DEMO_BPM, buildDemoMidi } from './demo';
import { MidiParseError, parseMidi } from './parse';
import type { MonoNote } from './reduce';
import type { MidiParams, MidiSummary } from './types';

const P = (over: Partial<MidiParams> = {}): MidiParams => ({ ...defaultMidiParams, minGapMs: 0, minNoteMs: 0, ...over });

function summaryOf(tracks: { notes: [number, number, number, number?][]; drums?: boolean }[], bpm = 120): MidiSummary {
  const ts = tracks.map((t, index) => {
    const notes = t.notes.map(([midi, time, duration, velocity = 0.8]) => ({ midi, time, duration, velocity }));
    const midis = notes.map((x) => x.midi);
    return {
      index,
      name: `T${index}`,
      instrument: t.drums ? 'Drums' : 'Piano',
      family: t.drums ? 'drums' : 'piano',
      channel: t.drums ? 9 : index,
      isPercussion: !!t.drums,
      noteCount: notes.length,
      minMidi: midis.length ? Math.min(...midis) : null,
      maxMidi: midis.length ? Math.max(...midis) : null,
      notes,
    };
  });
  const duration = Math.max(0, ...ts.flatMap((t) => t.notes.map((x) => x.time + x.duration)));
  return { name: 'Test', duration, ppq: 480, bpm, tempos: [{ time: 0, bpm }], timeSignature: [4, 4], timeSignatureChanges: 1, totalNotes: ts.reduce((a, t) => a + t.noteCount, 0), tracks: ts };
}

describe('normalizeMidiParams', () => {
  it('returns defaults for garbage and clamps values', () => {
    expect(normalizeMidiParams(null)).toEqual(defaultMidiParams);
    const p = normalizeMidiParams({ strategy: 'nope', speedPct: 9999, transpose: 7.6, rangeMinHz: 900, rangeMaxHz: 100, level: -1, retrigger: 'yes' });
    expect(p.strategy).toBe('highest');
    expect(p.speedPct).toBe(400);
    expect(p.transpose).toBe(8);
    expect(p.rangeMinHz).toBe(900);
    expect(p.rangeMaxHz).toBe(900);
    expect(p.level).toBe(0);
    expect(p.retrigger).toBe(true);
  });
});

describe('helpers', () => {
  it('speedFactor: speed % or target BPM', () => {
    expect(speedFactor(P({ speedPct: 50 }), 100)).toBe(0.5);
    expect(speedFactor(P({ tempoMode: 'bpm', targetBpm: 150 }), 100)).toBe(1.5);
  });
  it('trimNotes clips and shifts', () => {
    const out = trimNotes(
      [
        { midi: 60, time: 0, duration: 1, velocity: 1 },
        { midi: 62, time: 1.5, duration: 1, velocity: 1 },
        { midi: 64, time: 3, duration: 1, velocity: 1 },
      ],
      0.5,
      2,
    );
    expect(out.map((n) => [n.midi, n.time, n.duration])).toEqual([
      [60, 0, 0.5],
      [62, 1, 0.5],
    ]);
  });
  it('midiRange / fitMidi fold and clamp', () => {
    const [lo, hi] = midiRange(midiToFreq(48), midiToFreq(72));
    expect([lo, hi]).toEqual([48, 72]);
    expect(fitMidi(30, 48, 72, 'fold')).toBe(54);
    expect(fitMidi(90, 48, 72, 'fold')).toBe(66);
    expect(fitMidi(30, 48, 72, 'clamp')).toBe(48);
    expect(fitMidi(90, 48, 72, 'clamp')).toBe(72);
    expect(fitMidi(60, 60, 64, 'fold')).toBe(60);
    expect(fitMidi(70, 60, 64, 'fold')).toBe(60); // narrow range: fold then clamp
  });
  it('bestOctaveShift moves the melody into range', () => {
    expect(bestOctaveShift([84, 86, 88], 60, 76)).toBe(-12);
    expect(bestOctaveShift([60, 62], 60, 76)).toBe(0);
    expect(bestOctaveShift([], 60, 76)).toBe(0);
  });
  it('applyDurations: gate %, fixed and legato, never overlapping', () => {
    const mono: MonoNote[] = [
      { midi: 60, time: 0, duration: 0.5, velocity: 1, source: 0 },
      { midi: 62, time: 1, duration: 0.5, velocity: 1, source: 1 },
    ];
    expect(applyDurations(mono, P({ durationMode: 'scale', durationPct: 50 })).map((n) => n.duration)).toEqual([0.25, 0.25]);
    expect(applyDurations(mono, P({ durationMode: 'fixed', fixedMs: 2000, minGapMs: 10 })).map((n) => +n.duration.toFixed(6))).toEqual([0.99, 2]);
    expect(applyDurations(mono, P({ durationMode: 'legato', minGapMs: 0 })).map((n) => n.duration)).toEqual([1, 0.5]);
  });
  it('defaultTrackSelection excludes drums', () => {
    const s = summaryOf([{ notes: [[60, 0, 1]] }, { notes: [[36, 0, 1]], drums: true }, { notes: [] }]);
    expect(defaultTrackSelection(s)).toEqual([0]);
  });
});

describe('convertMidi', () => {
  const s = summaryOf(
    [
      { notes: [[72, 0, 1, 1], [74, 1, 1, 0.5]] },
      { notes: [[60, 0, 2], [64, 0, 2]] },
      { notes: [[36, 0, 0.1], [36, 0.5, 0.1]], drums: true },
    ],
    100,
  );

  it('merges selected tracks and reduces to the highest line', () => {
    const r = convertMidi(s, [0, 1], P());
    expect(r.sequence).not.toBeNull();
    expect(r.sequence!.events.map((e) => [e.time, e.duration, Math.round(e.freqStart * 100) / 100])).toEqual([
      [0, 1, Math.round(midiToFreq(72) * 100) / 100],
      [1, 1, Math.round(midiToFreq(74) * 100) / 100],
    ]);
    expect(r.stats.originalNotes).toBe(4);
    expect(r.stats.maxPolyphony).toBe(3);
    expect(r.stats.resultNotes).toBe(2);
    expect(r.sequence!.length).toBeCloseTo(2 + TAIL_SECONDS);
    expect(r.sequence!.bpm).toBe(100);
    expect(r.sequence!.label).toBe('midi-test');
  });

  it('lowest strategy picks the chord bass', () => {
    const r = convertMidi(s, [0, 1], P({ strategy: 'lowest' }));
    expect(r.mono.map((n) => n.midi)).toEqual([60]);
  });

  it('returns no sequence with no tracks selected', () => {
    const r = convertMidi(s, [], P());
    expect(r.sequence).toBeNull();
    expect(r.stats.resultNotes).toBe(0);
  });

  it('tempo scale, transpose, velocity gain', () => {
    const r = convertMidi(s, [0], P({ speedPct: 200, transpose: -12, level: 0.5 }));
    const ev = r.sequence!.events;
    expect(ev.map((e) => [e.time, e.duration])).toEqual([
      [0, 0.5],
      [0.5, 0.5],
    ]);
    expect(ev[0]!.freqStart).toBeCloseTo(midiToFreq(60));
    expect(ev.map((e) => e.gain)).toEqual([0.5, 0.25]);
    expect(r.sequence!.bpm).toBe(200);
    const fixed = convertMidi(s, [0], P({ gainMode: 'fixed', level: 0.7 }));
    expect(fixed.sequence!.events.map((e) => e.gain)).toEqual([0.7, 0.7]);
    const bpm = convertMidi(s, [0], P({ tempoMode: 'bpm', targetBpm: 50 }));
    expect(bpm.sequence!.events[1]!.time).toBe(2);
  });

  it('fit to range folds out-of-range notes and counts them', () => {
    const r = convertMidi(s, [0], P({ fitRange: true, fitMode: 'fold', rangeMinHz: midiToFreq(48), rangeMaxHz: midiToFreq(72) }));
    expect(r.mono.map((n) => n.midi)).toEqual([72, 62]);
    expect(r.stats.fittedNotes).toBe(1);
    expect(r.preFitMidi).toEqual([72, 74]);
  });

  it('trim selects a section that keeps its exact length', () => {
    const r = convertMidi(s, [0], P({ trimStart: 1, trimEnd: 1.5 }));
    expect(r.mono.map((n) => [n.midi, n.time, n.duration])).toEqual([[74, 0, 0.5]]);
    expect(r.sequence!.length).toBeCloseTo(0.5);
    expect(r.window).toEqual({ start: 1, end: 1.5 });
  });

  it('minimum gap separates repeated notes in the output', () => {
    const rep = summaryOf([{ notes: [[60, 0, 0.5], [60, 0.5, 0.5]] }]);
    const r = convertMidi(rep, [0], P({ minGapMs: 20 }));
    const [a, b] = r.sequence!.events;
    expect(b!.time - (a!.time + a!.duration)).toBeCloseTo(0.02);
  });
});

describe('MIDI file round trip', () => {
  it('builds a MIDI with @tonejs/midi, serializes, re-parses and converts', () => {
    const midi = new Midi();
    midi.header.setTempo(90);
    const lead = midi.addTrack();
    lead.name = 'Lead';
    lead.instrument.number = 80;
    const beat = 60 / 90;
    lead.addNote({ midi: 76, time: 0, duration: beat, velocity: 1 });
    lead.addNote({ midi: 79, time: beat, duration: beat, velocity: 0.5 });
    const chords = midi.addTrack();
    chords.name = 'Chords';
    chords.channel = 1;
    for (const m of [60, 64, 67]) chords.addNote({ midi: m, time: 0, duration: 2 * beat, velocity: 0.6 });
    const drums = midi.addTrack();
    drums.channel = 9;
    drums.addNote({ midi: 36, time: 0, duration: 0.1, velocity: 1 });

    const bytes = midi.toArray();
    const summary = parseMidi(bytes, 'round-trip.mid');
    expect(summary.name).toBe('round-trip');
    expect(summary.bpm).toBeCloseTo(90);
    expect(summary.tracks).toHaveLength(3);
    expect(summary.tracks[0]!.name).toBe('Lead');
    expect(summary.tracks[0]!.instrument.toLowerCase()).toContain('lead');
    expect(summary.tracks[1]!.noteCount).toBe(3);
    expect(summary.tracks[1]!.minMidi).toBe(60);
    expect(summary.tracks[1]!.maxMidi).toBe(67);
    expect(summary.tracks[2]!.isPercussion).toBe(true);
    expect(structuredClone(summary)).toEqual(summary);

    const sel = defaultTrackSelection(summary);
    expect(sel).toEqual([0, 1]);
    const r = convertMidi(summary, sel, P());
    expect(r.mono.map((n) => n.midi)).toEqual([76, 79]);
    expect(r.mono[0]!.time).toBeCloseTo(0, 3);
    expect(r.mono[1]!.time).toBeCloseTo(beat, 2);
    expect(r.stats.maxPolyphony).toBe(4);

    // renders to audio with the shared core
    const buf = renderPlayable(r.sequence!, { loops: 1, sampleRate: 8000 });
    expect(buf.length).toBeGreaterThan(8000);
    expect(buf.some((x) => Math.abs(x) > 0.1)).toBe(true);
  });

  it('parses the built-in demo', () => {
    const s = parseMidi(buildDemoMidi(), 'demo.mid');
    expect(s.bpm).toBeCloseTo(DEMO_BPM);
    expect(s.tracks.filter((t) => t.isPercussion)).toHaveLength(1);
    const r = convertMidi(s, defaultTrackSelection(s), defaultMidiParams);
    expect(r.stats.maxPolyphony).toBeGreaterThan(3);
    expect(r.stats.resultNotes).toBeGreaterThan(20);
    for (let i = 1; i < r.mono.length; i++) {
      const a = r.mono[i - 1]!;
      expect(r.mono[i]!.time - (a.time + a.duration)).toBeGreaterThanOrEqual(0.015 - 1e-9);
    }
  });

  it('rejects invalid data with a readable error', () => {
    expect(() => parseMidi(new TextEncoder().encode('hello, this is not a midi file'))).toThrow(MidiParseError);
    expect(() => parseMidi(new Uint8Array([1, 2, 3]))).toThrow(/too small/);
    const broken = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 1, 1, 0xe0, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 99, 0x90]);
    expect(() => parseMidi(broken)).toThrow(MidiParseError);
  });
});
