/**
 * Pure, deterministic event scheduler: turns a Playable (Sequence or
 * SequenceSource) into CoreEvents stamped with absolute sample frames.
 *
 * The live engine calls `advance(nowFrame + horizon)` from a look-ahead timer
 * and posts the returned events to the worklet; the offline renderer calls it
 * block by block. Same code path => export matches live playback.
 */
import type { CoreEvent } from './dsp/synthCore';
import { toSource, type Playable, type Sequence, type SequenceSource, type ToneEvent } from './types';

export interface SchedulerStartOptions {
  /** Absolute frame where playback (re)starts. */
  startFrame: number;
  loop: boolean;
  /** Start this many seconds into the first chunk (resume / re-cue). Wrapped into the chunk length. */
  offsetSeconds?: number;
  /** Index of the first chunk to request (default 0). */
  chunkIndex?: number;
  /** Stop after this many chunks regardless of loop (export "N loops"). */
  maxChunks?: number;
}

interface OpenChunk {
  index: number;
  startFrame: number;
  lengthFrames: number;
  sequence: Sequence;
  events: ToneEvent[];
  /** Original index of each sorted event inside sequence.events. */
  order: number[];
  cursor: number;
}

export interface SchedulerPosition {
  chunkIndex: number;
  /** Seconds into the current chunk. */
  seconds: number;
  /** Length of the current chunk in seconds. */
  length: number;
  bpm?: number;
}

const MAX_HISTORY = 8;

export function secondsToFrames(seconds: number, sampleRate: number): number {
  return Math.round(seconds * sampleRate);
}

/** Clip events so that nothing is audible at/after `cutFrame`. */
export function clipEvents(events: readonly CoreEvent[], cutFrame: number): CoreEvent[] {
  const out: CoreEvent[] = [];
  for (const e of events) {
    if (e.activateFrame >= cutFrame) continue;
    out.push(e.endFrame > cutFrame ? { ...e, endFrame: cutFrame } : e);
  }
  return out;
}

export class Scheduler {
  readonly sampleRate: number;
  private source: SequenceSource | null = null;
  private loop = false;
  private resumeFrame = 0;
  private chunksPlayed = 0;
  private maxChunks: number | undefined;
  private history: OpenChunk[] = [];
  private pendingOffsetFrames = 0;
  private nextChunkIndex = 0;
  private nextChunkStart = 0;
  /** Exclusive frame where playback ends, once known. */
  endFrame: number | null = null;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  get isStarted(): boolean {
    return this.source !== null;
  }

  get isFinished(): boolean {
    return this.endFrame !== null;
  }

  get currentSource(): SequenceSource | null {
    return this.source;
  }

  start(playable: Playable, opts: SchedulerStartOptions): void {
    this.source = toSource(playable);
    this.loop = opts.loop;
    this.resumeFrame = opts.startFrame;
    this.maxChunks = opts.maxChunks;
    this.chunksPlayed = 0;
    this.history = [];
    this.endFrame = null;
    this.nextChunkIndex = opts.chunkIndex ?? 0;
    this.nextChunkStart = opts.startFrame;
    this.pendingOffsetFrames = Math.max(0, secondsToFrames(opts.offsetSeconds ?? 0, this.sampleRate));
  }

  reset(): void {
    this.source = null;
    this.history = [];
    this.endFrame = null;
  }

  /** Replace the material for chunks that have not been opened yet (next loop boundary). */
  setPlayable(playable: Playable): void {
    this.source = toSource(playable);
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  private hasNextChunk(): boolean {
    if (!this.source) return false;
    if (this.maxChunks !== undefined && this.chunksPlayed >= this.maxChunks) return false;
    if (this.chunksPlayed === 0) return true;
    if (this.loop) return true;
    const count = this.source.chunkCount ?? 1;
    return this.nextChunkIndex < count;
  }

  private openNext(): OpenChunk {
    const src = this.source!;
    const index = this.nextChunkIndex;
    const seq = src.chunk(index);
    const lengthFrames = Math.max(1, secondsToFrames(seq.length, this.sampleRate));
    let startFrame = this.nextChunkStart;
    if (this.pendingOffsetFrames > 0) {
      startFrame -= this.pendingOffsetFrames % lengthFrames;
      this.pendingOffsetFrames = 0;
    }
    const order = seq.events
      .map((_, i) => i)
      .filter((i) => {
        const e = seq.events[i]!;
        return e.duration > 0 && e.time >= 0 && e.time < seq.length && e.freqStart > 0;
      })
      .sort((a, b) => seq.events[a]!.time - seq.events[b]!.time || a - b);
    const chunk: OpenChunk = {
      index,
      startFrame,
      lengthFrames,
      sequence: seq,
      events: order.map((i) => seq.events[i]!),
      order,
      cursor: 0,
    };
    this.history.push(chunk);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    this.chunksPlayed++;
    this.nextChunkIndex = index + 1;
    this.nextChunkStart = startFrame + lengthFrames;
    return chunk;
  }

  /** Return all not-yet-emitted events whose activation frame is < untilFrame. */
  advance(untilFrame: number): CoreEvent[] {
    const out: CoreEvent[] = [];
    if (!this.source || this.endFrame !== null) return out;
    if (this.history.length === 0) this.openNext();
    for (;;) {
      const chunk = this.history[this.history.length - 1]!;
      const sr = this.sampleRate;
      while (chunk.cursor < chunk.events.length) {
        const e = chunk.events[chunk.cursor]!;
        const startFrame = chunk.startFrame + secondsToFrames(e.time, sr);
        if (Math.max(startFrame, this.resumeFrame) >= untilFrame) break;
        chunk.cursor++;
        const endFrame = chunk.startFrame + secondsToFrames(e.time + e.duration, sr);
        if (endFrame <= this.resumeFrame || endFrame <= startFrame) continue;
        const ev: CoreEvent = {
          startFrame,
          activateFrame: Math.max(startFrame, this.resumeFrame),
          endFrame,
          freqStart: e.freqStart,
          gain: Math.max(0, Math.min(1, e.gain)),
          index: chunk.order[chunk.cursor - 1]!,
          chunk: chunk.index,
        };
        if (e.freqEnd !== undefined) ev.freqEnd = e.freqEnd;
        if (e.curve !== undefined) ev.curve = e.curve;
        if (e.waveform !== undefined) ev.waveform = e.waveform;
        if (e.duty !== undefined) ev.duty = e.duty;
        if (e.step !== undefined) ev.step = e.step;
        out.push(ev);
      }
      if (chunk.cursor < chunk.events.length) break;
      const nextStart = chunk.startFrame + chunk.lengthFrames;
      if (nextStart >= untilFrame) break;
      if (!this.hasNextChunk()) {
        this.endFrame = nextStart;
        break;
      }
      this.openNext();
    }
    return out;
  }

  /** Playback position at an absolute frame (based on the chunks opened so far). */
  positionAt(frame: number): SchedulerPosition | null {
    if (this.history.length === 0) return null;
    let chunk = this.history[0]!;
    for (const c of this.history) if (c.startFrame <= frame) chunk = c;
    const sr = this.sampleRate;
    const seconds = Math.min(Math.max(0, frame - chunk.startFrame), chunk.lengthFrames) / sr;
    return {
      chunkIndex: chunk.index,
      seconds,
      length: chunk.lengthFrames / sr,
      bpm: chunk.sequence.bpm ?? this.source?.bpm,
    };
  }
}
