/**
 * Siren mode: pure params -> Sequence compiler.
 *
 * One cycle lasts `cycleSeconds`:
 * - alternate: up-sweep (half cycle) then down-sweep (half cycle);
 * - rise:      one up-sweep, then jumps back to the bottom;
 * - fall:      one down-sweep, then jumps back to the top.
 * Every event touches the next one, so the whole pass is one legato,
 * phase-continuous tone (ARCHITECTURE legato rule) — and since an alternating
 * pass ends where it starts, looping is seamless too.
 *
 * Curves: the three DSP glide curves, plus 'smooth' — a sine-like LFO shape
 * (ease-in-out on a log-frequency axis, slow at the turnarounds), played as
 * touching exponential pieces.
 *
 * The pass holds `cycles` cycles; the transport LOOP toggle repeats the pass
 * (LOOP off = exactly `cycles` cycles, then stop).
 */
import type { GlideCurve, Sequence, ToneEvent, Waveform } from '../../audio/types';

export type SirenDirection = 'alternate' | 'rise' | 'fall';
export type SirenCurve = GlideCurve | 'smooth';
/** 'global' = use the transport waveform/duty. */
export type SirenWaveform = 'global' | Waveform;

export interface SirenParams {
  /** Hz */
  minFreq: number;
  /** Hz */
  maxFreq: number;
  /** Seconds per full cycle (1 / sweep rate). */
  cycleSeconds: number;
  /** Cycles per pass. */
  cycles: number;
  direction: SirenDirection;
  curve: SirenCurve;
  waveform: SirenWaveform;
  /** 0..1 */
  gain: number;
}

export const SIREN_FREQ_MIN = 1;
export const SIREN_FREQ_MAX = 20000;
export const SIREN_CYCLE_MIN = 0.05;
export const SIREN_CYCLE_MAX = 30;
export const SIREN_CYCLES_MAX = 128;

export const SIREN_DIRECTIONS: readonly SirenDirection[] = ['alternate', 'rise', 'fall'];
export const SIREN_CURVES: readonly SirenCurve[] = ['smooth', 'linear', 'exponential', 'logarithmic'];
export const SIREN_WAVEFORMS: readonly SirenWaveform[] = ['global', 'square', 'sine', 'triangle', 'sawtooth'];

export const defaultSirenParams: SirenParams = {
  minFreq: 300,
  maxFreq: 1200,
  cycleSeconds: 2,
  cycles: 4,
  direction: 'alternate',
  curve: 'smooth',
  waveform: 'global',
  gain: 0.8,
};

function num(v: unknown, d: number, lo: number, hi: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}
function oneOf<T extends string>(v: unknown, list: readonly T[], d: T): T {
  return typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d;
}

export function normalizeSirenParams(raw: unknown): SirenParams {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Partial<Record<keyof SirenParams, unknown>>;
  const d = defaultSirenParams;
  return {
    minFreq: num(r.minFreq, d.minFreq, SIREN_FREQ_MIN, SIREN_FREQ_MAX),
    maxFreq: num(r.maxFreq, d.maxFreq, SIREN_FREQ_MIN, SIREN_FREQ_MAX),
    cycleSeconds: num(r.cycleSeconds, d.cycleSeconds, SIREN_CYCLE_MIN, SIREN_CYCLE_MAX),
    cycles: Math.round(num(r.cycles, d.cycles, 1, SIREN_CYCLES_MAX)),
    direction: oneOf(r.direction, SIREN_DIRECTIONS, d.direction),
    curve: oneOf(r.curve, SIREN_CURVES, d.curve),
    waveform: oneOf(r.waveform, SIREN_WAVEFORMS, d.waveform),
    gain: num(r.gain, d.gain, 0, 1),
  };
}

/** Pieces per sweep used to approximate the 'smooth' shape. */
export const SMOOTH_PIECES = 16;

/** 'smooth' shape: frequency at normalized time u of a sweep a -> b. */
export function smoothAt(a: number, b: number, u: number): number {
  const e = (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, u)))) / 2;
  return a * Math.pow(b / a, e);
}

function sweep(a: number, b: number, curve: SirenCurve, time: number, dur: number, base: Omit<ToneEvent, 'time' | 'duration' | 'freqStart'>): ToneEvent[] {
  if (curve !== 'smooth') return [{ ...base, time, duration: dur, freqStart: a, freqEnd: b, curve }];
  const out: ToneEvent[] = [];
  for (let k = 0; k < SMOOTH_PIECES; k++) {
    const t0 = time + (dur * k) / SMOOTH_PIECES;
    const t1 = time + (dur * (k + 1)) / SMOOTH_PIECES;
    out.push({
      ...base,
      time: t0,
      duration: t1 - t0,
      freqStart: smoothAt(a, b, k / SMOOTH_PIECES),
      freqEnd: smoothAt(a, b, (k + 1) / SMOOTH_PIECES),
      curve: 'exponential',
    });
  }
  return out;
}

export function buildSirenSequence(params: SirenParams): Sequence {
  const p = normalizeSirenParams(params);
  const lo = Math.min(p.minFreq, p.maxFreq);
  const hi = Math.max(p.minFreq, p.maxFreq);
  const base: Omit<ToneEvent, 'time' | 'duration' | 'freqStart'> = { gain: p.gain };
  if (p.waveform !== 'global') base.waveform = p.waveform;
  const T = p.cycleSeconds;
  const events: ToneEvent[] = [];
  for (let c = 0; c < p.cycles; c++) {
    const t = c * T;
    if (p.direction === 'alternate') {
      events.push(...sweep(lo, hi, p.curve, t, T / 2, base));
      events.push(...sweep(hi, lo, p.curve, t + T / 2, T - T / 2, base));
    } else if (p.direction === 'rise') {
      events.push(...sweep(lo, hi, p.curve, t, T, base));
    } else {
      events.push(...sweep(hi, lo, p.curve, t, T, base));
    }
  }
  return { events, length: T * p.cycles, label: `siren-${Math.round(lo)}-${Math.round(hi)}hz` };
}
