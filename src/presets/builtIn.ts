/**
 * Built-in presets (read-only, shipped with the app). Ids are stable
 * (prefix "builtin-"); never rename them, user data and docs refer to them.
 *
 * Every preset carries the COMPLETE params object of its mode (typed with the
 * mode's params interface), so it passes the mode's normalizeParams unchanged
 * (see builtIn.test.ts). Frequencies stay roughly within 80–1500 Hz, where
 * typical small musical Tesla coils sound clearest with the square wave.
 */
import { defaultFrequencyParams, type FrequencyParams } from '../modes/frequency/build';
import type { MelodyNote, MelodyParams } from '../modes/melody/build';
import { defaultPulseParams, type PulseParams } from '../modes/pulse/build';
import type { RampParams } from '../modes/ramp/build';
import type { RandomParams } from '../modes/random/build';
import { emptyPattern, snapLength, type SeqPattern, type SequencerParams } from '../modes/sequencer/build';
import type { SirenParams } from '../modes/siren/build';
import type { ModeId } from '../studio/types';
import type { Preset } from './types';

interface ParamsByMode {
  ramp: RampParams;
  pulse: PulseParams;
  siren: SirenParams;
  random: RandomParams;
  melody: MelodyParams;
  sequencer: SequencerParams;
  frequency: FrequencyParams;
}

function preset<M extends keyof ParamsByMode & ModeId>(mode: M, id: `builtin-${string}`, name: string, description: string, params: ParamsByMode[M]): Preset<ParamsByMode[M]> {
  return { id, name, mode, params, builtIn: true, description };
}

// ---------------------------------------------------------------- helpers

/** Sequencer pattern from [midi, velocity, length-in-steps] cells (null = rest). */
function pattern(cells: readonly ([number, number, number] | null)[]): SeqPattern {
  const p = emptyPattern(16);
  cells.forEach((c, i) => {
    if (c) p.notes[i] = { on: true, muted: false, midi: c[0], velocity: c[1], length: snapLength(c[2]) };
  });
  return p;
}

/** Arpeggio over one chord: 7 notes up, 5 back down (12 eighth notes = 1.5 bars). */
function arp(chord: readonly number[]): MelodyNote[] {
  const up = chord.slice(0, 7);
  const down = up.slice(1, -1).reverse();
  return [...up, ...down].map((midi) => ({ midi, beats: 0.5 }));
}

// A minor riff: A2 bass pulses with octave/fifth answers (110–440 Hz).
const A2 = 45, C3 = 48, D3 = 50, E3 = 52, G3 = 55, A3 = 57, C4 = 60, E4 = 64;
const RHYTHM_A = pattern([
  [A2, 1, 0.45], null, [A2, 0.6, 0.3], [A3, 0.8, 0.4],
  [A2, 1, 0.45], null, [E3, 0.75, 0.4], [G3, 0.7, 0.4],
  [A2, 1, 0.45], null, [A2, 0.6, 0.3], [A3, 0.8, 0.4],
  [C4, 0.95, 0.8], null, [A3, 0.7, 0.4], [E3, 0.7, 0.4],
]);
const RHYTHM_B = pattern([
  [D3, 1, 0.45], null, [D3, 0.6, 0.3], [A3, 0.8, 0.4],
  [D3, 1, 0.45], null, [C3, 0.75, 0.4], [D3, 0.7, 0.4],
  [E3, 1, 0.45], null, [E3, 0.6, 0.3], [E4, 0.85, 0.4],
  [G3, 0.95, 0.6], [E3, 0.7, 0.4], [C3, 0.8, 0.6], null,
]);

// ---------------------------------------------------------------- presets

export const BUILT_IN_PRESETS: readonly Preset[] = [
  preset('ramp', 'builtin-frequency-ramp', 'Frequency Ramp', 'Smooth pitch climb from 110 Hz to 1100 Hz over 6 seconds — a classic "charging up" sound.', {
    startFreq: 110,
    endFreq: 1100,
    duration: 6,
    curve: 'exponential',
    upDown: false,
    steps: 1,
    stepStyle: 'hold',
    stepGap: 0.04,
    pauseBefore: 0,
    pauseAfter: 0.6,
    repeats: 1,
    gain: 0.85,
  }),
  preset('pulse', 'builtin-fast-pulse', 'Fast Pulse', 'Short, punchy 330 Hz bursts on eighth notes at 170 BPM. Crisp, rhythmic arcs.', {
    ...defaultPulseParams,
    bpm: 170,
    frequency: 330,
    pulseMs: 40,
    pauseSeconds: 0,
    repetitions: 0,
    pattern: 'eighths',
    accent: 0.3,
    gain: 0.9,
    custom: [...defaultPulseParams.custom],
  }),
  preset('pulse', 'builtin-slow-pulse', 'Slow Pulse', 'One deep 150 Hz pulse per beat at 60 BPM — a calm heartbeat-like thump.', {
    ...defaultPulseParams,
    bpm: 60,
    frequency: 150,
    pulseMs: 160,
    pauseSeconds: 0,
    repetitions: 0,
    pattern: 'quarters',
    accent: 0.15,
    gain: 0.9,
    custom: [...defaultPulseParams.custom],
  }),
  preset('siren', 'builtin-rising-siren', 'Rising Siren', 'Repeated upward sweeps from 200 Hz to 1200 Hz, jumping back down after each rise.', {
    minFreq: 200,
    maxFreq: 1200,
    cycleSeconds: 2.5,
    cycles: 4,
    direction: 'rise',
    curve: 'exponential',
    waveform: 'global',
    gain: 0.85,
  }),
  preset('siren', 'builtin-falling-siren', 'Falling Siren', 'Downward "dive" sweeps from 1400 Hz to 250 Hz, like a bomb drop.', {
    minFreq: 250,
    maxFreq: 1400,
    cycleSeconds: 1.6,
    cycles: 6,
    direction: 'fall',
    curve: 'exponential',
    waveform: 'global',
    gain: 0.85,
  }),
  preset('siren', 'builtin-alternating-siren', 'Alternating Siren', 'Continuous smooth up/down wail between 400 Hz and 1100 Hz.', {
    minFreq: 400,
    maxFreq: 1100,
    cycleSeconds: 1.2,
    cycles: 8,
    direction: 'alternate',
    curve: 'smooth',
    waveform: 'global',
    gain: 0.85,
  }),
  preset('sequencer', 'builtin-electronic-rhythm', 'Electronic Rhythm', 'One-bar A minor bass riff at 132 BPM in pattern A, with a second bar in B (turn on Chain to play A → B), 110–330 Hz.', {
    bpm: 132,
    swing: 0.08,
    gate: 1,
    root: 9,
    scale: 'a-minor',
    octave: 2,
    range: 2,
    density: 0.6,
    current: 0,
    chain: false,
    chainSlots: [true, true, false, false],
    patterns: [RHYTHM_A, RHYTHM_B, emptyPattern(), emptyPattern()],
  }),
  preset('random', 'builtin-random-lightning', 'Random Lightning', 'Wild pentatonic leaps on 16th notes between 150 Hz and 1400 Hz — a new phrase every two bars.', {
    minFreq: 150,
    maxFreq: 1400,
    randomness: 0.9,
    bpm: 150,
    stepsPerBeat: 4,
    gate: 0.45,
    scale: 'pentatonic',
    root: 0,
    restProbability: 0.3,
    seed: 4242,
    repeat: false,
    bars: 2,
    gain: 0.85,
  }),
  preset('melody', 'builtin-arpeggio', 'Arpeggio', 'Rising and falling broken chords Am – F – C – G at 140 BPM (130–880 Hz).', {
    notes: [
      ...arp([57, 60, 64, 69, 72, 76, 81]), // Am: A3 C4 E4 A4 C5 E5 A5
      ...arp([53, 57, 60, 65, 69, 72, 77]), // F:  F3 A3 C4 F4 A4 C5 F5
      ...arp([48, 52, 55, 60, 64, 67, 72]), // C:  C3 E3 G3 C4 E4 G4 C5
      ...arp([55, 59, 62, 67, 71, 74, 79]), // G:  G3 B3 D4 G4 B4 D5 G5
    ],
    bpm: 140,
    gate: 80,
    duration: 'eighth',
    scale: 'a-minor',
    snapToScale: false,
    octave: 3,
    gain: 0.85,
  }),
  preset('frequency', 'builtin-test-signal', 'Test Signal', 'Steady 440 Hz (A4) tone. Use it to check pairing, output device and volume.', {
    ...defaultFrequencyParams,
    frequency: 440,
    gain: 0.8,
    subMode: 'steady',
    sweep: { ...defaultFrequencyParams.sweep },
    steps: defaultFrequencyParams.steps.map((s) => ({ ...s })),
  }),
];

/** Presets suggested to first-time users ("Quick start" row in the Presets tab). */
export const FEATURED_PRESET_IDS: readonly string[] = ['builtin-test-signal', 'builtin-alternating-siren', 'builtin-arpeggio', 'builtin-fast-pulse'];
