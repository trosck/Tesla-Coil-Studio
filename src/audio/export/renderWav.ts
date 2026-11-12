/**
 * Offline renderer: Playable -> Float32Array -> WAV. Uses the very same
 * Scheduler + SynthCore as live playback (the worklet), so the result matches.
 */
import { SynthCore } from '../dsp/synthCore';
import { clipEvents, Scheduler, secondsToFrames } from '../scheduler';
import { toSource, type Playable, type Waveform } from '../types';
import { encodeMonoWav } from './wavEncoder';

export const EXPORT_SAMPLE_RATE = 44100;
/** Hard cap to keep memory / UI blocking sane (10 minutes). */
export const MAX_EXPORT_SECONDS = 600;

export interface RenderOptions {
  sampleRate?: number;
  /**
   * Render this many loops (default 1). One loop = one pass of the material:
   * a Sequence, or all `chunkCount` chunks of a finite SequenceSource (e.g. a
   * sequencer chain A→B); for endless sources one loop = one chunk.
   * Ignored when durationSeconds is set.
   */
  loops?: number;
  /** Render exactly this many seconds (loops the material as needed). */
  durationSeconds?: number;
  /** 0..1 master volume (default 1). Output peak never exceeds the 0.9 ceiling. */
  volume?: number;
  /** Global waveform / duty (same meaning as the transport bar settings). */
  waveform?: Waveform;
  duty?: number;
  attackMs?: number;
  releaseMs?: number;
}

const BLOCK = 4096;

/** Chunks in one pass of the material (1 for a Sequence or an endless source). */
export function chunksPerLoop(playable: Playable): number {
  const n = toSource(playable).chunkCount;
  return n !== undefined && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function renderPlayable(playable: Playable, opts: RenderOptions = {}): Float32Array {
  const sampleRate = opts.sampleRate ?? EXPORT_SAMPLE_RATE;
  const core = new SynthCore({
    sampleRate,
    masterGain: opts.volume ?? 1,
    waveform: opts.waveform ?? 'square',
    duty: opts.duty ?? 0.5,
    attackMs: opts.attackMs,
    releaseMs: opts.releaseMs,
  });
  const scheduler = new Scheduler(sampleRate);
  const maxFrames = secondsToFrames(MAX_EXPORT_SECONDS, sampleRate);
  const byDuration = opts.durationSeconds !== undefined;
  const cutFrame = byDuration ? Math.min(maxFrames, Math.max(0, secondsToFrames(opts.durationSeconds!, sampleRate))) : maxFrames;
  scheduler.start(playable, {
    startFrame: 0,
    loop: true,
    maxChunks: byDuration ? undefined : Math.max(1, Math.floor(opts.loops ?? 1)) * chunksPerLoop(playable),
  });

  const lookahead = BLOCK + core.releaseLength + 1;
  const blocks: Float32Array[] = [];
  let frame = 0;
  let endFrame = cutFrame;
  let truncated = false;
  while (frame < endFrame) {
    core.schedule(clipEvents(scheduler.advance(frame + BLOCK + lookahead), cutFrame));
    if (!byDuration && scheduler.endFrame !== null && !truncated) {
      endFrame = Math.min(cutFrame, scheduler.endFrame);
      core.truncate(endFrame);
      truncated = true;
    }
    const n = Math.min(BLOCK, endFrame - frame);
    const block = new Float32Array(n);
    core.render(block, n);
    blocks.push(block);
    frame += n;
  }
  const out = new Float32Array(frame);
  let o = 0;
  for (const b of blocks) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

export interface WavExportOptions extends RenderOptions {
  stereo?: boolean;
}

/** Render and encode to a 44.1 kHz / 16-bit WAV ArrayBuffer. */
export function renderWav(playable: Playable, opts: WavExportOptions = {}): ArrayBuffer {
  const sampleRate = opts.sampleRate ?? EXPORT_SAMPLE_RATE;
  const samples = renderPlayable(playable, { ...opts, sampleRate });
  return encodeMonoWav(samples, sampleRate, opts.stereo ?? false);
}

/** Trigger a browser download for binary data. */
export function downloadBlob(data: BlobPart, filename: string, type = 'audio/wav'): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function timestampedName(prefix: string, ext = 'wav'): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const safe = prefix.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'tesla-coil';
  return `${safe}-${stamp}.${ext}`;
}
