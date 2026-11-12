/** Message protocol between the main thread (engine) and the worklet processors. */
import type { CoreEvent } from '../dsp/synthCore';
import type { Waveform } from '../types';

export const SYNTH_PROCESSOR = 'tesla-synth';
export const RECORDER_PROCESSOR = 'tesla-recorder';

export type SynthInMessage =
  | { type: 'schedule'; events: CoreEvent[] }
  /** Cut everything at `frame` (with release ramp). */
  | { type: 'truncate'; frame: number }
  | { type: 'clear' }
  | { type: 'noteOn'; freq: number; gain: number }
  | { type: 'noteOff' }
  | { type: 'setWaveform'; waveform: Waveform }
  | { type: 'setDuty'; duty: number };

export interface SynthStatusMessage {
  type: 'status';
  /** Worklet frame when the status was sampled. */
  frame: number;
  active: boolean;
  freq: number;
  amp: number;
  eventIndex: number;
  step: number;
  chunk: number;
  live: boolean;
}

export type SynthOutMessage = SynthStatusMessage;

export type RecorderInMessage = { type: 'start' } | { type: 'stop' };
export type RecorderOutMessage = { type: 'data'; samples: Float32Array } | { type: 'stopped' };

export interface SynthProcessorOptions {
  attackMs?: number;
  releaseMs?: number;
  waveform?: Waveform;
  duty?: number;
  /** Status messages per second (default 60). */
  statusRate?: number;
}
