/**
 * Pure pattern editing helpers (immutable updates). Unit-tested in pattern.test.ts.
 */
import { createRng, quantizeMidi, scaleNotesInRange, type Rng, type Scale } from '../../audio/music';
import { LENGTH_MAX, LENGTH_MIN, MAX_STEPS, MIDI_MAX, MIDI_MIN, clonePattern, emptyPattern, type SeqPattern, type SeqStep, type StepCount } from './build';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function updateStep(p: SeqPattern, i: number, patch: Partial<SeqStep>): SeqPattern {
  if (i < 0 || i >= MAX_STEPS) return p;
  const notes = p.notes.slice();
  const cur = notes[i]!;
  const next: SeqStep = { ...cur, ...patch };
  next.midi = clamp(Math.round(next.midi), MIDI_MIN, MIDI_MAX);
  next.length = clamp(next.length, LENGTH_MIN, LENGTH_MAX);
  next.velocity = clamp(next.velocity, 0, 1);
  notes[i] = next;
  return { ...p, notes };
}

/**
 * Grid click: a different pitch (or a rest) sets the note and turns it on;
 * clicking the active note toggles it to a rest. A rest step that is turned on
 * gets the default gate as its length.
 */
export function clickCell(p: SeqPattern, i: number, midi: number, defaultGate: number): SeqPattern {
  const st = p.notes[i];
  if (!st) return p;
  if (st.on && st.midi === midi) return updateStep(p, i, { on: false });
  return updateStep(p, i, { on: true, midi, length: st.on ? st.length : defaultGate });
}

/** Toggle rest/note without changing the stored pitch. */
export function toggleRest(p: SeqPattern, i: number): SeqPattern {
  const st = p.notes[i];
  if (!st) return p;
  return updateStep(p, i, { on: !st.on });
}

/**
 * Change the played length. 16 -> 32 duplicates the first half when the second
 * half holds no notes (otherwise keeps it); 32 -> 16 only stops playing steps
 * 16..31, their data is kept.
 */
export function setStepCount(p: SeqPattern, steps: StepCount): SeqPattern {
  if (steps === p.steps) return p;
  if (steps === 32) {
    const upperEmpty = p.notes.slice(16).every((s) => !s.on);
    const notes = p.notes.map((s, i) => (i >= 16 && upperEmpty ? { ...p.notes[i - 16]! } : { ...s }));
    return { steps, notes };
  }
  return { ...clonePattern(p), steps };
}

/** Transpose every step (rests too, so they keep relative pitch) by semitones. */
export function transposePattern(p: SeqPattern, semitones: number): SeqPattern {
  const ons = p.notes.filter((s) => s.on).map((s) => s.midi);
  let d = Math.round(semitones);
  // Keep the whole pattern in range: limit the shift instead of squashing notes.
  if (ons.length > 0) {
    const hi = Math.max(...ons);
    const lo = Math.min(...ons);
    d = clamp(d, MIDI_MIN - lo, MIDI_MAX - hi);
  }
  return { ...p, notes: p.notes.map((s) => ({ ...s, midi: clamp(s.midi + d, MIDI_MIN, MIDI_MAX) })) };
}

/** Snap every note to the nearest note of the scale. */
export function snapPatternToScale(p: SeqPattern, scale: Scale): SeqPattern {
  return { ...p, notes: p.notes.map((s) => ({ ...s, midi: clamp(quantizeMidi(s.midi, scale), MIDI_MIN, MIDI_MAX) })) };
}

/** Set the length of every note in the played range. */
export function applyGateToAll(p: SeqPattern, gate: number): SeqPattern {
  return { ...p, notes: p.notes.map((s, i) => (i < p.steps && s.on ? { ...s, length: clamp(gate, LENGTH_MIN, LENGTH_MAX) } : { ...s })) };
}

export function clearPattern(p: SeqPattern, midi: number, gate: number): SeqPattern {
  return emptyPattern(p.steps, midi, gate);
}

/** Does step i sound into step i+1 (tie / slide / hold)? */
export function isTiedToNext(p: SeqPattern, i: number): boolean {
  const st = p.notes[i];
  return !!st && st.on && st.length >= 1 - 1e-9 && i < p.steps - 1;
}

export interface RandomizeOptions {
  scale: Scale;
  lowMidi: number;
  highMidi: number;
  /** 0..1 */
  density: number;
  gate: number;
  rng?: Rng;
}

/**
 * Musical, scale-aware random pattern: downbeats are favored, pitches move by
 * small scale steps around the root with occasional octave jumps, beats get
 * accents and some notes are held over the following rest.
 */
export function randomizePattern(p: SeqPattern, o: RandomizeOptions): SeqPattern {
  const rng = o.rng ?? createRng((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  const pool = scaleNotesInRange(o.scale, o.lowMidi, o.highMidi);
  const notesPool = pool.length > 0 ? pool : [clamp(Math.round(o.lowMidi), MIDI_MIN, MIDI_MAX)];
  const density = clamp(o.density, 0, 1);
  // Start on a root note in the lower half of the range if there is one.
  const rootIdx = notesPool.findIndex((m) => ((m % 12) + 12) % 12 === o.scale.root);
  const home = rootIdx >= 0 ? rootIdx : 0;
  let idx = home;
  const out = emptyPattern(p.steps, notesPool[home]!, o.gate);
  // Preserve hidden data beyond the played range.
  for (let i = p.steps; i < MAX_STEPS; i++) out.notes[i] = { ...p.notes[i]! };

  for (let i = 0; i < p.steps; i++) {
    const beat = i % 4 === 0;
    const eighth = i % 2 === 0;
    const prob = i === 0 ? 1 : beat ? 0.35 + 0.65 * density : eighth ? 0.15 + 0.7 * density : 0.05 + 0.6 * density;
    if (!rng.chance(prob)) continue;
    // Melodic motion.
    const r = rng.next();
    if (beat && rng.chance(0.25)) idx = home;
    else if (r < 0.12) idx += rng.pick([-7, 7, -5, 5]);
    else if (r < 0.35) idx += 0;
    else idx += rng.pick([-2, -1, -1, 1, 1, 2]);
    // Reflect back into range.
    const n = notesPool.length;
    if (idx < 0) idx = Math.min(n - 1, -idx);
    if (idx >= n) idx = Math.max(0, 2 * (n - 1) - idx);
    idx = clamp(idx, 0, n - 1);
    const velocity = beat ? rng.range(0.88, 1) : eighth ? rng.range(0.7, 0.85) : rng.range(0.55, 0.75);
    let length = clamp(o.gate, LENGTH_MIN, 1);
    // Occasionally hold over a following rest.
    if (rng.chance(0.15)) length = rng.pick([1.5, 2]);
    out.notes[i] = { on: true, midi: notesPool[idx]!, velocity: Math.round(velocity * 100) / 100, length };
  }
  // Held notes should only hold over rests (not slur into the next hit by accident).
  for (let i = 0; i < p.steps; i++) {
    const st = out.notes[i]!;
    if (!st.on || st.length < 1) continue;
    let free = 0;
    for (let j = i + 1; j < p.steps && !out.notes[j]!.on && free < 4; j++) free++;
    st.length = free === 0 ? clamp(o.gate, LENGTH_MIN, 1) : Math.min(st.length, free + clamp(o.gate, LENGTH_MIN, 1));
  }
  return out;
}
