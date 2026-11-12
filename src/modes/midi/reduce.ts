/**
 * Polyphony reduction: polyphonic notes -> monophonic, non-overlapping line.
 * Pure functions; all times in seconds.
 */
import type { MidiNote, ReduceStrategy } from './types';

/** A note of the reduced melody. `source` = index of the input note it came from. */
export interface MonoNote extends MidiNote {
  source: number;
}

export interface ReduceOptions {
  strategy: ReduceStrategy;
  /** When the sounding note ends while another (lower priority) note is still held, resume it. */
  retrigger: boolean;
  /** Minimum silence between consecutive output notes (s). 0 = touching notes allowed (legato). */
  minGap: number;
  /** Input notes and output fragments shorter than this are dropped (s). */
  minNote: number;
}

export const DEFAULT_REDUCE_OPTIONS: ReduceOptions = { strategy: 'highest', retrigger: true, minGap: 0.015, minNote: 0.02 };

const EPS = 1e-9;

interface Held {
  note: MidiNote;
  index: number;
  end: number;
}

/** true when `a` has priority over `b` under the strategy. Deterministic total order. */
function beats(a: Held, b: Held, strategy: ReduceStrategy): boolean {
  const na = a.note;
  const nb = b.note;
  let d = 0;
  switch (strategy) {
    case 'highest':
      d = na.midi - nb.midi;
      break;
    case 'lowest':
      d = nb.midi - na.midi;
      break;
    case 'recent':
      d = na.time - nb.time;
      if (Math.abs(d) < EPS) d = na.midi - nb.midi; // chord onset: top note
      break;
    case 'loudest':
      d = na.velocity - nb.velocity;
      if (Math.abs(d) < EPS) d = na.midi - nb.midi;
      break;
  }
  if (Math.abs(d) > EPS) return d > 0;
  // ties: the later-starting note wins, then the later input index
  const dt = na.time - nb.time;
  if (Math.abs(dt) > EPS) return dt > 0;
  return a.index > b.index;
}

function best(list: Iterable<Held>, strategy: ReduceStrategy): Held | null {
  let w: Held | null = null;
  for (const h of list) if (!w || beats(h, w, strategy)) w = h;
  return w;
}

/**
 * Maximum number of simultaneously sounding notes. A note ending exactly when
 * another starts does not overlap it.
 */
export function maxPolyphony(notes: readonly MidiNote[]): number {
  const pts: [number, number][] = [];
  for (const n of notes) {
    if (!(n.duration > 0)) continue;
    pts.push([n.time, 1], [n.time + n.duration, -1]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let max = 0;
  for (const [, d] of pts) {
    cur += d;
    if (cur > max) max = cur;
  }
  return max;
}

/**
 * Make `notes` (sorted by time, non-overlapping) leave at least `gap` seconds
 * between one note's end and the next note's start, shortening the earlier
 * note. Notes that would become shorter than `minLength` are dropped.
 */
export function enforceGap<T extends MidiNote>(notes: readonly T[], gap: number, minLength = 0.001): T[] {
  const out: T[] = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const next = notes[i + 1];
    let duration = n.duration;
    if (next) duration = Math.min(duration, next.time - gap - n.time);
    if (duration >= minLength - EPS && duration > 0) out.push(duration === n.duration ? n : { ...n, duration });
  }
  return out;
}

/**
 * Reduce polyphonic notes to a monophonic line.
 *
 * Sweep over note on/off times. At each time point, ended notes are released
 * first, then new notes are added. The winner is the highest-priority note
 * among the candidates: all held notes when `retrigger` is on, otherwise only
 * the currently sounding note plus notes starting right now (a held note that
 * lost once is never resumed). When the winner changes, the previous output
 * note is truncated at that instant and a new output note starts (a resumed
 * note starts at the resume time). Afterwards: fragments shorter than
 * `minNote` are dropped and `minGap` silence is enforced between notes, so
 * output never overlaps.
 */
export function reducePolyphony(input: readonly MidiNote[], opts: Partial<ReduceOptions> = {}): MonoNote[] {
  const o = { ...DEFAULT_REDUCE_OPTIONS, ...opts };
  const minNote = Math.max(0, o.minNote);
  const notes: Held[] = [];
  input.forEach((note, index) => {
    if (note.duration > EPS && note.duration >= minNote - EPS && Number.isFinite(note.time)) {
      notes.push({ note, index, end: note.time + note.duration });
    }
  });
  if (notes.length === 0) return [];

  // time points
  const times = new Set<number>();
  for (const h of notes) {
    times.add(h.note.time);
    times.add(h.end);
  }
  const sortedTimes = [...times].sort((a, b) => a - b);
  const byStart = [...notes].sort((a, b) => a.note.time - b.note.time || a.index - b.index);

  const held = new Set<Held>();
  let current: Held | null = null;
  let segStart = 0;
  let nextStart = 0;
  const segments: MonoNote[] = [];

  const close = (t: number) => {
    if (current && t - segStart > EPS) {
      const n = current.note;
      segments.push({ midi: n.midi, velocity: n.velocity, time: segStart, duration: t - segStart, source: current.index });
    }
  };

  for (const t of sortedTimes) {
    // release
    for (const h of held) if (h.end <= t + EPS) held.delete(h);
    // attack
    const started: Held[] = [];
    while (nextStart < byStart.length && byStart[nextStart]!.note.time <= t + EPS) {
      const h = byStart[nextStart++]!;
      if (h.end > t + EPS) {
        held.add(h);
        started.push(h);
      }
    }
    const curHeld = current && held.has(current) ? current : null;
    let winner: Held | null;
    if (o.retrigger) winner = best(held, o.strategy);
    else winner = best(curHeld ? [curHeld, ...started] : started, o.strategy);
    if (winner !== current) {
      close(t);
      current = winner;
      segStart = t;
    }
  }
  close(sortedTimes[sortedTimes.length - 1]!);

  const kept = segments.filter((s) => s.duration >= minNote - EPS);
  return enforceGap(kept, Math.max(0, o.minGap));
}
