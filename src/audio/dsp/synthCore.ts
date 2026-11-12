/**
 * Shared DSP core: a pure, dependency-free monophonic synth.
 *
 * Used verbatim by BOTH the AudioWorklet processor (live playback) and the
 * offline WAV renderer (export), so the two are sample-identical for the same
 * scheduled events. Do not import anything browser-specific here.
 *
 * Time is measured in integer sample frames on an absolute timeline
 * (`this.frame`). Events are queued with absolute frame stamps and rendered
 * sample-accurately.
 */
import type { GlideCurve, Waveform } from '../types';

/** A ToneEvent resolved to absolute sample frames (produced by the Scheduler). */
export interface CoreEvent {
  /** Frame at which the event nominally starts (t = 0 of its glide curve). */
  startFrame: number;
  /**
   * Frame at which the event becomes audible. Usually === startFrame; later when
   * playback resumes / is re-cued in the middle of an event.
   */
  activateFrame: number;
  /** Exclusive end frame. Infinity for held live notes. */
  endFrame: number;
  freqStart: number;
  freqEnd?: number;
  curve?: GlideCurve;
  gain: number;
  waveform?: Waveform;
  duty?: number;
  /** Index of the event inside its chunk (-1 for live notes). */
  index: number;
  /** Optional step number (ToneEvent.step). */
  step?: number;
  /** Chunk number the event came from (-1 for live notes). */
  chunk: number;
  /** True for noteOn() events. */
  live?: boolean;
}

export interface SynthCoreOptions {
  sampleRate: number;
  /** Attack ramp in ms (default 3). */
  attackMs?: number;
  /** Release ramp in ms (default 3). */
  releaseMs?: number;
  /** Absolute output ceiling (default 0.9). Output never exceeds ±ceiling. */
  ceiling?: number;
  /** Master gain 0..1 applied before the ceiling clamp (default 1). */
  masterGain?: number;
  waveform?: Waveform;
  duty?: number;
}

export interface SynthStatus {
  active: boolean;
  freq: number;
  amp: number;
  eventIndex: number;
  step: number;
  chunk: number;
  live: boolean;
}

export const DEFAULT_CEILING = 0.9;
export const MIN_FREQ = 1;
export const MIN_DUTY = 0.01;
export const MAX_DUTY = 0.99;

export function clampDuty(d: number): number {
  if (!Number.isFinite(d)) return 0.5;
  return Math.min(MAX_DUTY, Math.max(MIN_DUTY, d));
}

/**
 * Frequency of a glide at normalized time t in [0, 1].
 * linear:      f0 + (f1 - f0) t
 * exponential: f0 (f1 / f0)^t
 * logarithmic: f0 + (f1 - f0) log10(1 + 9 t)
 */
export function glideFrequency(f0: number, f1: number, t: number, curve: GlideCurve = 'linear'): number {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  switch (curve) {
    case 'exponential': {
      const a = Math.max(MIN_FREQ, f0);
      const b = Math.max(MIN_FREQ, f1);
      return a * Math.pow(b / a, u);
    }
    case 'logarithmic':
      return f0 + (f1 - f0) * Math.log10(1 + 9 * u);
    case 'linear':
    default:
      return f0 + (f1 - f0) * u;
  }
}

/** PolyBLEP residual for a discontinuity at phase 0 (phase, dt in cycles). */
function polyBlep(t: number, dt: number): number {
  if (dt <= 0) return 0;
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** One sample of a band-limited oscillator at `phase` (0..1) with increment `dt`. */
export function oscillatorSample(waveform: Waveform, phase: number, dt: number, duty: number): number {
  switch (waveform) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    case 'triangle': {
      let p = phase + 0.25;
      if (p >= 1) p -= 1;
      return 1 - 4 * Math.abs(p - 0.5);
    }
    case 'sawtooth':
      return 2 * phase - 1 - polyBlep(phase, dt);
    case 'square':
    default: {
      let v = phase < duty ? 1 : -1;
      v += polyBlep(phase, dt);
      let p2 = phase - duty;
      if (p2 < 0) p2 += 1;
      v -= polyBlep(p2, dt);
      return v;
    }
  }
}

interface ActiveVoice {
  ev: CoreEvent;
  /** Frame the voice became current. */
  activatedAt: number;
  /** Amplitude at activation (for smooth legato / cut-over attacks). */
  startAmp: number;
  attackFrames: number;
  releaseFrames: number;
}

export class SynthCore {
  readonly sampleRate: number;
  /** Absolute frame of the next sample to be rendered. */
  frame = 0;

  private attackFrames: number;
  private releaseFrames: number;
  private ceiling: number;
  private masterGain: number;
  private waveform: Waveform;
  private duty: number;

  /** Pending events sorted by activateFrame (stable). */
  private queue: CoreEvent[] = [];
  private voice: ActiveVoice | null = null;
  private phase = 0;
  private lastAmp = 0;
  private lastFreq = 0;

  constructor(opts: SynthCoreOptions) {
    this.sampleRate = opts.sampleRate;
    this.attackFrames = Math.max(0, Math.round(((opts.attackMs ?? 3) * opts.sampleRate) / 1000));
    this.releaseFrames = Math.max(0, Math.round(((opts.releaseMs ?? 3) * opts.sampleRate) / 1000));
    this.ceiling = opts.ceiling ?? DEFAULT_CEILING;
    this.masterGain = opts.masterGain ?? 1;
    this.waveform = opts.waveform ?? 'square';
    this.duty = clampDuty(opts.duty ?? 0.5);
  }

  /** Global waveform used by events that do not specify one. Takes effect immediately. */
  setWaveform(w: Waveform): void {
    this.waveform = w;
  }

  /** Global square duty cycle used by events that do not specify one. Takes effect immediately. */
  setDuty(d: number): void {
    this.duty = clampDuty(d);
  }

  setMasterGain(g: number): void {
    this.masterGain = Math.max(0, Math.min(1, g));
  }

  get releaseLength(): number {
    return this.releaseFrames;
  }

  /** Add events (any order). Events entirely in the past are dropped at render time. */
  schedule(events: readonly CoreEvent[]): void {
    for (const ev of events) {
      if (!(ev.endFrame > ev.activateFrame) || !(ev.freqStart > 0)) continue;
      // stable sorted insert by activateFrame
      let i = this.queue.length;
      while (i > 0 && this.queue[i - 1]!.activateFrame > ev.activateFrame) i--;
      this.queue.splice(i, 0, ev);
    }
  }

  /**
   * Cut everything at `frame`: queued events starting at/after it are removed,
   * anything sounding past it ends there (with a release ramp, never sooner than
   * one release length from now so there is no click).
   */
  truncate(frame: number): void {
    const earliest = this.frame + this.releaseFrames;
    const cut = Math.max(frame, earliest);
    this.queue = this.queue
      .filter((e) => e.activateFrame < cut)
      .map((e) => (e.endFrame > cut ? { ...e, endFrame: cut } : e));
    if (this.voice && this.voice.ev.endFrame > cut) {
      this.voice.ev = { ...this.voice.ev, endFrame: cut };
    }
  }

  /** Stop everything now (with release ramp). */
  clear(): void {
    this.truncate(this.frame);
  }

  /** Start a held live note immediately (later-wins over whatever is sounding). */
  noteOn(freq: number, gain = 0.8): void {
    this.queue = this.queue.filter((e) => !e.live);
    const ev: CoreEvent = {
      startFrame: this.frame,
      activateFrame: this.frame,
      endFrame: Infinity,
      freqStart: Math.max(MIN_FREQ, freq),
      gain: Math.max(0, Math.min(1, gain)),
      index: -1,
      chunk: -1,
      live: true,
    };
    // put it in front of anything not yet due
    let i = 0;
    while (i < this.queue.length && this.queue[i]!.activateFrame <= this.frame) i++;
    this.queue.splice(i, 0, ev);
  }

  /** Release the held live note (if any). */
  noteOff(): void {
    this.queue = this.queue.filter((e) => !e.live);
    if (this.voice?.ev.live) {
      this.voice.ev = { ...this.voice.ev, endFrame: this.frame + this.releaseFrames };
    }
  }

  getStatus(): SynthStatus {
    const v = this.voice;
    return {
      active: v !== null,
      freq: v ? this.lastFreq : 0,
      amp: this.lastAmp,
      eventIndex: v ? v.ev.index : -1,
      step: v ? (v.ev.step ?? v.ev.index) : -1,
      chunk: v ? v.ev.chunk : -1,
      live: v?.ev.live ?? false,
    };
  }

  /** Number of queued (not yet active) events. */
  get pendingCount(): number {
    return this.queue.length;
  }

  private activate(ev: CoreEvent, n: number): void {
    const startAmp = this.voice ? this.lastAmp : 0;
    const len = ev.endFrame - n;
    let attack = this.attackFrames;
    let release = this.releaseFrames;
    if (Number.isFinite(len) && attack + release > len) {
      const half = Math.max(1, Math.floor(len / 2));
      attack = Math.min(attack, half);
      release = Math.min(release, half);
    }
    if (startAmp <= 0) this.phase = 0;
    this.voice = { ev, activatedAt: n, startAmp, attackFrames: attack, releaseFrames: release };
  }

  /** Render `count` samples into `out` starting at `offset`, advancing `this.frame`. */
  render(out: Float32Array, count: number = out.length, offset = 0): void {
    const sr = this.sampleRate;
    const ceil = this.ceiling;
    const master = this.masterGain;
    let n = this.frame;
    for (let i = 0; i < count; i++, n++) {
      // 1. take over any due events (later wins)
      while (this.queue.length > 0 && this.queue[0]!.activateFrame <= n) {
        const ev = this.queue.shift()!;
        if (ev.endFrame <= n) continue;
        this.activate(ev, n);
      }
      const v = this.voice;
      if (v !== null && n >= v.ev.endFrame) {
        this.voice = null;
      }
      if (this.voice === null) {
        out[offset + i] = 0;
        this.lastAmp = 0;
        continue;
      }
      const ev = (v as ActiveVoice).ev;
      const voice = v as ActiveVoice;

      // 2. frequency
      let freq = ev.freqStart;
      if (ev.freqEnd !== undefined && ev.freqEnd !== ev.freqStart && Number.isFinite(ev.endFrame)) {
        const total = ev.endFrame - ev.startFrame;
        const t = total > 0 ? (n - ev.startFrame) / total : 1;
        freq = glideFrequency(ev.freqStart, ev.freqEnd, t, ev.curve);
      }
      if (freq < MIN_FREQ) freq = MIN_FREQ;
      const nyq = sr * 0.5;
      if (freq > nyq) freq = nyq;
      const dt = freq / sr;

      // 3. envelope: attack from startAmp to gain, then release to 0 at endFrame
      const k = n - voice.activatedAt;
      let amp: number;
      if (voice.attackFrames > 0 && k < voice.attackFrames) {
        amp = voice.startAmp + (ev.gain - voice.startAmp) * (k / voice.attackFrames);
      } else {
        amp = ev.gain;
      }
      const remaining = ev.endFrame - n;
      if (voice.releaseFrames > 0 && remaining < voice.releaseFrames) {
        const next = this.queue[0];
        const legato = next !== undefined && next.activateFrame <= ev.endFrame;
        if (!legato) amp *= remaining / voice.releaseFrames;
      }

      // 4. oscillator
      const wf = ev.waveform ?? this.waveform;
      const duty = ev.duty !== undefined ? clampDuty(ev.duty) : this.duty;
      let s = oscillatorSample(wf, this.phase, dt, duty) * amp * master * ceil;
      if (s > ceil) s = ceil;
      else if (s < -ceil) s = -ceil;
      out[offset + i] = s;

      this.phase += dt;
      if (this.phase >= 1) this.phase -= Math.floor(this.phase);
      this.lastAmp = amp;
      this.lastFreq = freq;
    }
    this.frame = n;
  }
}
