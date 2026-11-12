/**
 * Ramp mode: pure params -> Sequence compiler.
 *
 * Timeline of one repetition ("leg" = one ramp of `duration` seconds):
 *
 *   [pauseBefore] [up leg: start -> end] [down leg: end -> start, if upDown] [pauseAfter]
 *
 * `steps > 1` splits every leg into N equal slots separated by `stepGap`
 * seconds of silence. Each slot either glides along its portion of the curve
 * ('glide') or holds one steady pitch sampled from the curve ('hold' =
 * staircase).
 *
 * Repetition / looping: the Sequence contains `repeats` copies of the
 * repetition back to back (one "pass"). The transport LOOP toggle is what
 * decides whether the pass is played again (ARCHITECTURE: "Sequence.loop is
 * informational; the transport LOOP toggle decides"), so:
 *   LOOP off -> exactly `repeats` ramps, then stop;
 *   LOOP on  -> the pass repeats forever (repeats only groups ramps per loop).
 * Export "N loops" renders N passes.
 */
import type { GlideCurve, Sequence, ToneEvent } from '../../audio/types';

export type RampStepStyle = 'glide' | 'hold';

export interface RampParams {
  /** Hz */
  startFreq: number;
  /** Hz */
  endFreq: number;
  /** Seconds of one ramp leg (the down leg of up-down takes the same time). */
  duration: number;
  curve: GlideCurve;
  /** Ramp back from end to start after reaching the end. */
  upDown: boolean;
  /** 1 = smooth ramp; 2..32 = split into N segments. */
  steps: number;
  stepStyle: RampStepStyle;
  /** Seconds of silence between segments (steps > 1). */
  stepGap: number;
  /** Seconds of silence before each ramp. */
  pauseBefore: number;
  /** Seconds of silence after each ramp (also the gap before the next loop). */
  pauseAfter: number;
  /** Ramps per pass (1..64). */
  repeats: number;
  /** 0..1 */
  gain: number;
}

export const RAMP_FREQ_MIN = 1;
export const RAMP_FREQ_MAX = 20000;
export const RAMP_DURATION_MIN = 0.05;
export const RAMP_DURATION_MAX = 60;
export const RAMP_STEPS_MAX = 32;
export const RAMP_PAUSE_MAX = 10;
export const RAMP_GAP_MAX = 1;
export const RAMP_REPEATS_MAX = 64;

export const RAMP_CURVES: readonly GlideCurve[] = ['linear', 'exponential', 'logarithmic'];
const STEP_STYLES: readonly RampStepStyle[] = ['glide', 'hold'];

export const defaultRampParams: RampParams = {
  startFreq: 100,
  endFreq: 1000,
  duration: 2,
  curve: 'exponential',
  upDown: false,
  steps: 1,
  stepStyle: 'hold',
  stepGap: 0.04,
  pauseBefore: 0,
  pauseAfter: 0.5,
  repeats: 1,
  gain: 0.8,
};

// ---------------------------------------------------------------- normalize

function num(v: unknown, d: number, lo: number, hi: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}
function int(v: unknown, d: number, lo: number, hi: number): number {
  return Math.round(num(v, d, lo, hi));
}
function oneOf<T extends string>(v: unknown, list: readonly T[], d: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d;
}
function bool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d;
}

export function normalizeRampParams(raw: unknown): RampParams {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Partial<Record<keyof RampParams, unknown>>;
  const d = defaultRampParams;
  return {
    startFreq: num(r.startFreq, d.startFreq, RAMP_FREQ_MIN, RAMP_FREQ_MAX),
    endFreq: num(r.endFreq, d.endFreq, RAMP_FREQ_MIN, RAMP_FREQ_MAX),
    duration: num(r.duration, d.duration, RAMP_DURATION_MIN, RAMP_DURATION_MAX),
    curve: oneOf(r.curve, RAMP_CURVES, d.curve),
    upDown: bool(r.upDown, d.upDown),
    steps: int(r.steps, d.steps, 1, RAMP_STEPS_MAX),
    stepStyle: oneOf(r.stepStyle, STEP_STYLES, d.stepStyle),
    stepGap: num(r.stepGap, d.stepGap, 0, RAMP_GAP_MAX),
    pauseBefore: num(r.pauseBefore, d.pauseBefore, 0, RAMP_PAUSE_MAX),
    pauseAfter: num(r.pauseAfter, d.pauseAfter, 0, RAMP_PAUSE_MAX),
    repeats: int(r.repeats, d.repeats, 1, RAMP_REPEATS_MAX),
    gain: num(r.gain, d.gain, 0, 1),
  };
}

// ---------------------------------------------------------------- build

/** Frequency of the overall curve a -> b at normalized time u (matches the DSP glide). */
export function curveAt(a: number, b: number, u: number, curve: GlideCurve): number {
  const t = Math.min(1, Math.max(0, u));
  if (curve === 'exponential') return a * Math.pow(b / a, t);
  if (curve === 'logarithmic') return a + (b - a) * Math.log10(1 + 9 * t);
  return a + (b - a) * t;
}

/** Sub-events used to approximate a slice of a logarithmic curve (legato, piecewise linear). */
const LOG_SLICES = 16;

/**
 * Events that play the portion [u0, u1] of the curve a -> b during
 * [time, time + dur]. Linear and exponential slices are exact single events;
 * a slice of a logarithmic curve is not itself a log curve, so it is played
 * as touching (legato, phase-continuous) linear pieces.
 */
function glideSlice(a: number, b: number, curve: GlideCurve, u0: number, u1: number, time: number, dur: number, gain: number): ToneEvent[] {
  if (u0 === 0 && u1 === 1) return [{ time, duration: dur, freqStart: a, freqEnd: b, curve, gain }];
  const fa = curveAt(a, b, u0, curve);
  const fb = curveAt(a, b, u1, curve);
  if (curve !== 'logarithmic') return [{ time, duration: dur, freqStart: fa, freqEnd: fb, curve, gain }];
  const n = Math.max(2, Math.ceil(LOG_SLICES * (u1 - u0)));
  const out: ToneEvent[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = time + (dur * k) / n;
    const t1 = time + (dur * (k + 1)) / n;
    out.push({
      time: t0,
      duration: t1 - t0,
      freqStart: curveAt(a, b, u0 + ((u1 - u0) * k) / n, curve),
      freqEnd: curveAt(a, b, u0 + ((u1 - u0) * (k + 1)) / n, curve),
      curve: 'linear',
      gain,
    });
  }
  return out;
}

/**
 * One leg a -> b starting at `time`. `cyclic` (up-down hold mode) samples the
 * staircase at u = k/N so the down leg doesn't repeat the top/bottom step;
 * otherwise a hold staircase hits both endpoints exactly (u = k/(N-1)).
 */
function legEvents(p: RampParams, a: number, b: number, time: number, cyclic: boolean): ToneEvent[] {
  const n = p.steps;
  const D = p.duration;
  if (n <= 1) return glideSlice(a, b, p.curve, 0, 1, time, D, p.gain);
  const slot = D / n;
  const gap = Math.min(p.stepGap, slot * 0.5);
  const out: ToneEvent[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = time + slot * k;
    const t1 = k === n - 1 ? time + D : time + slot * (k + 1) - gap;
    const dur = t1 - t0;
    if (p.stepStyle === 'hold') {
      const u = cyclic ? k / n : k / (n - 1);
      out.push({ time: t0, duration: dur, freqStart: curveAt(a, b, u, p.curve), gain: p.gain });
    } else {
      out.push(...glideSlice(a, b, p.curve, k / n, (k + 1) / n, t0, dur, p.gain));
    }
  }
  return out;
}

/** Seconds of one repetition. */
export function rampRepetitionSeconds(p: RampParams): number {
  return p.pauseBefore + p.duration * (p.upDown ? 2 : 1) + p.pauseAfter;
}

export function buildRampSequence(params: RampParams): Sequence {
  const p = normalizeRampParams(params);
  const rep = rampRepetitionSeconds(p);
  const events: ToneEvent[] = [];
  for (let r = 0; r < p.repeats; r++) {
    const t = r * rep + p.pauseBefore;
    events.push(...legEvents(p, p.startFreq, p.endFreq, t, p.upDown));
    if (p.upDown) events.push(...legEvents(p, p.endFreq, p.startFreq, t + p.duration, true));
  }
  return {
    events,
    length: rep * p.repeats,
    label: `ramp-${Math.round(p.startFreq)}-${Math.round(p.endFreq)}hz`,
  };
}
