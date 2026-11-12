import type { Sequence } from '../../audio/types';

export interface FrequencyParams {
  /** Hz */
  frequency: number;
  /** 0..1 */
  gain: number;
}

export const FREQ_MIN = 1;
export const FREQ_MAX = 20000;

export const defaultFrequencyParams: FrequencyParams = { frequency: 440, gain: 0.8 };

export function normalizeFrequencyParams(raw: unknown): FrequencyParams {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof FrequencyParams, unknown>>;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    frequency: num(r.frequency, defaultFrequencyParams.frequency, FREQ_MIN, FREQ_MAX),
    gain: num(r.gain, defaultFrequencyParams.gain, 0, 1),
  };
}

/**
 * Steady test tone: one 1-second event filling a 1-second loop. Touching
 * events are rendered legato, so looping is seamless (no gaps).
 */
export function buildFrequencySequence(p: FrequencyParams): Sequence {
  return {
    events: [{ time: 0, duration: 1, freqStart: p.frequency, gain: p.gain }],
    length: 1,
    loop: true,
    label: `tone-${Math.round(p.frequency)}hz`,
  };
}
