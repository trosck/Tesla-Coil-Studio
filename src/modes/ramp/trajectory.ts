/**
 * Pure helpers for the inline frequency-trajectory previews (used by the
 * Ramp and Siren panels). Samples a Sequence's glides with the same formula
 * as the DSP core and maps them to SVG path data on a log-frequency axis.
 */
import { glideFrequency } from '../../audio/dsp/synthCore';
import type { Sequence } from '../../audio/types';

export interface TrajectoryPoint {
  t: number;
  f: number;
}

/** Polylines of (time, freq); a new polyline starts after every silent gap. */
export function sampleTrajectory(seq: Sequence, pointsPerEvent = 24): TrajectoryPoint[][] {
  const events = [...seq.events].filter((e) => e.time < seq.length).sort((a, b) => a.time - b.time);
  const lines: TrajectoryPoint[][] = [];
  let current: TrajectoryPoint[] | null = null;
  let lastEnd = -Infinity;
  const eps = 1e-6;
  // Keep total points bounded for very long / dense sequences.
  const per = Math.max(2, Math.min(pointsPerEvent, Math.floor(2000 / Math.max(1, events.length))));
  for (const e of events) {
    const steady = e.freqEnd === undefined || e.freqEnd === e.freqStart;
    const n = steady ? 2 : per;
    const touching = current !== null && Math.abs(e.time - lastEnd) < eps;
    if (!touching) {
      current = [];
      lines.push(current);
    }
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const f = steady ? e.freqStart : glideFrequency(e.freqStart, e.freqEnd!, u, e.curve);
      current!.push({ t: e.time + e.duration * u, f });
    }
    lastEnd = e.time + e.duration;
  }
  return lines;
}

export interface PlotBox {
  width: number;
  height: number;
  /** Time span shown on the x axis (s). */
  length: number;
  fMin: number;
  fMax: number;
  /** Vertical padding in px. */
  pad?: number;
}

/** y coordinate for a frequency on a log axis. */
export function freqToY(f: number, box: PlotBox): number {
  const pad = box.pad ?? 6;
  const lo = Math.log(Math.max(1, box.fMin));
  const hi = Math.log(Math.max(box.fMin + 1e-6, box.fMax));
  const span = hi - lo || 1;
  const u = (Math.log(Math.max(1, f)) - lo) / span;
  return pad + (1 - u) * (box.height - 2 * pad);
}

export function timeToX(t: number, box: PlotBox): number {
  return (t / (box.length || 1)) * box.width;
}

/** SVG path data for sampled polylines. */
export function trajectoryPath(lines: TrajectoryPoint[][], box: PlotBox): string {
  const parts: string[] = [];
  for (const line of lines) {
    line.forEach((pt, i) => {
      parts.push(`${i === 0 ? 'M' : 'L'}${timeToX(pt.t, box).toFixed(1)} ${freqToY(pt.f, box).toFixed(1)}`);
    });
  }
  return parts.join('');
}

/** Frequency range covered by a sequence (for axis bounds). */
export function sequenceFreqRange(seq: Sequence): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const e of seq.events) {
    for (const f of [e.freqStart, e.freqEnd ?? e.freqStart]) {
      if (f < min) min = f;
      if (f > max) max = f;
    }
  }
  if (!Number.isFinite(min)) return { min: 20, max: 20000 };
  if (max / min < 1.05) return { min: min / 1.25, max: max * 1.25 };
  return { min, max };
}
