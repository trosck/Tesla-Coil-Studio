/**
 * Built-in demo song, generated with @tonejs/midi: lead melody, pad chords,
 * bass and a drum track (channel 10) — polyphonic on purpose so the
 * reduction strategies can be compared.
 */
import { Midi } from '@tonejs/midi';

export const DEMO_FILE_NAME = 'Demo - Neon Arc.mid';
export const DEMO_BPM = 112;

// One bar per chord: Am F C G (twice). [root, third, fifth] as MIDI numbers.
const CHORDS: [number, number, number][] = [
  [57, 60, 64],
  [53, 57, 60],
  [55, 60, 64],
  [55, 59, 62],
];

// Lead: [beat offset within the 8-bar phrase, length in beats, midi]
const MELODY: [number, number, number][] = [
  [0, 1, 76], [1, 0.5, 74], [1.5, 0.5, 72], [2, 1, 71], [3, 1, 72],
  [4, 1.5, 77], [5.5, 0.5, 76], [6, 1, 74], [7, 1, 72],
  [8, 0.5, 72], [8.5, 0.5, 72], [9, 1, 76], [10, 1, 79], [11, 1, 76],
  [12, 2, 74], [14, 0.5, 71], [14.5, 0.5, 72], [15, 1, 74],
  [16, 1, 76], [17, 0.5, 74], [17.5, 0.5, 72], [18, 1, 71], [19, 1, 69],
  [20, 1, 69], [21, 1, 72], [22, 1, 77], [23, 1, 81],
  [24, 1, 79], [25, 0.5, 76], [25.5, 0.5, 76], [26, 1, 72], [27, 1, 76],
  [28, 3, 74], [31, 1, 71],
];

/** Build the demo as Standard MIDI File bytes. */
export function buildDemoMidi(): Uint8Array {
  const midi = new Midi();
  midi.name = 'Neon Arc (demo)';
  midi.header.setTempo(DEMO_BPM);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.header.update();
  const beat = 60 / DEMO_BPM;

  const lead = midi.addTrack();
  lead.name = 'Lead';
  lead.channel = 0;
  lead.instrument.number = 80; // Lead 1 (square)
  for (const [b, len, m] of MELODY) lead.addNote({ midi: m, time: b * beat, duration: len * beat * 0.95, velocity: 0.9 });
  // a short grace note to show the minimum-length filter
  lead.addNote({ midi: 83, time: 23.9 * beat, duration: 0.01, velocity: 0.5 });

  const pad = midi.addTrack();
  pad.name = 'Chords';
  pad.channel = 1;
  pad.instrument.number = 0; // Acoustic Grand Piano
  const bass = midi.addTrack();
  bass.name = 'Bass';
  bass.channel = 2;
  bass.instrument.number = 33; // Electric Bass (finger)
  const drums = midi.addTrack();
  drums.name = 'Drums';
  drums.channel = 9;

  for (let bar = 0; bar < 8; bar++) {
    const chord = CHORDS[bar % CHORDS.length]!;
    const t0 = bar * 4 * beat;
    for (const m of chord) pad.addNote({ midi: m, time: t0, duration: 4 * beat * 0.98, velocity: 0.55 });
    const root = chord[0]! - 12;
    for (let q = 0; q < 4; q++) {
      bass.addNote({ midi: q === 3 ? root + 7 : root, time: t0 + q * beat, duration: beat * 0.8, velocity: 0.75 });
    }
    for (let e = 0; e < 8; e++) {
      const t = t0 + e * beat * 0.5;
      drums.addNote({ midi: 42, time: t, duration: beat * 0.25, velocity: 0.5 }); // closed hi-hat
      if (e % 4 === 0) drums.addNote({ midi: 36, time: t, duration: beat * 0.25, velocity: 0.9 }); // kick
      if (e % 4 === 2) drums.addNote({ midi: 38, time: t, duration: beat * 0.25, velocity: 0.85 }); // snare
    }
  }
  return midi.toArray();
}

/** The demo as a standalone ArrayBuffer (transferable to the parser worker). */
export function buildDemoBuffer(): ArrayBuffer {
  const bytes = buildDemoMidi();
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}
