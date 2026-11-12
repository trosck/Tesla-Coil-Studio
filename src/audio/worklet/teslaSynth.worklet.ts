/**
 * AudioWorklet entry module. Bundled by Vite as a worker entry
 * (`?worker&url` import in engine.ts), so the shared SynthCore is inlined into
 * the emitted file in production builds.
 *
 * Registers two processors:
 * - 'tesla-synth'    renders CoreEvents with the shared SynthCore.
 * - 'tesla-recorder' captures its input (master output) as Float32 batches.
 */
import { SynthCore } from '../dsp/synthCore';
import {
  RECORDER_PROCESSOR,
  SYNTH_PROCESSOR,
  type RecorderInMessage,
  type SynthInMessage,
  type SynthProcessorOptions,
  type SynthStatusMessage,
} from './protocol';

// ---- AudioWorkletGlobalScope declarations (module-scoped, not in lib.dom) ----
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(
  name: string,
  ctor: new (options: { processorOptions?: unknown }) => AudioWorkletProcessor,
): void;

class TeslaSynthProcessor extends AudioWorkletProcessor {
  private core: SynthCore;
  private statusEvery: number;
  private sinceStatus = 0;
  private wasActive = false;

  constructor(options: { processorOptions?: unknown }) {
    super(options);
    const o = (options.processorOptions ?? {}) as SynthProcessorOptions;
    this.core = new SynthCore({
      sampleRate,
      attackMs: o.attackMs,
      releaseMs: o.releaseMs,
      waveform: o.waveform,
      duty: o.duty,
    });
    this.statusEvery = Math.max(128, Math.round(sampleRate / (o.statusRate ?? 60)));
    this.port.onmessage = (e: MessageEvent<SynthInMessage>) => this.onMessage(e.data);
  }

  private onMessage(msg: SynthInMessage): void {
    switch (msg.type) {
      case 'schedule':
        this.core.schedule(msg.events);
        break;
      case 'truncate':
        this.core.truncate(msg.frame);
        break;
      case 'clear':
        this.core.clear();
        break;
      case 'noteOn':
        this.core.noteOn(msg.freq, msg.gain);
        break;
      case 'noteOff':
        this.core.noteOff();
        break;
      case 'setWaveform':
        this.core.setWaveform(msg.waveform);
        break;
      case 'setDuty':
        this.core.setDuty(msg.duty);
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    const ch0 = out?.[0];
    if (!out || !ch0) return true;
    this.core.frame = currentFrame;
    this.core.render(ch0, ch0.length);
    for (let c = 1; c < out.length; c++) out[c]!.set(ch0);

    this.sinceStatus += ch0.length;
    if (this.sinceStatus >= this.statusEvery) {
      this.sinceStatus = 0;
      const s = this.core.getStatus();
      if (s.active || this.wasActive) {
        const msg: SynthStatusMessage = { type: 'status', frame: currentFrame, ...s };
        this.port.postMessage(msg);
      }
      this.wasActive = s.active;
    }
    return true;
  }
}

/** Collects input channel 0 into ~4096-frame batches while recording. */
class RecorderProcessor extends AudioWorkletProcessor {
  private recording = false;
  private buffer = new Float32Array(4096);
  private fill = 0;

  constructor(options: { processorOptions?: unknown }) {
    super(options);
    this.port.onmessage = (e: MessageEvent<RecorderInMessage>) => {
      if (e.data.type === 'start') {
        this.fill = 0;
        this.recording = true;
      } else if (e.data.type === 'stop') {
        this.flush();
        this.recording = false;
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  private flush(): void {
    if (this.fill === 0) return;
    const samples = this.buffer.slice(0, this.fill);
    this.port.postMessage({ type: 'data', samples }, [samples.buffer]);
    this.fill = 0;
  }

  process(inputs: Float32Array[][]): boolean {
    if (!this.recording) return true;
    const input = inputs[0]?.[0];
    const frames = input?.length ?? 128;
    for (let i = 0; i < frames; i++) {
      this.buffer[this.fill++] = input ? input[i]! : 0;
      if (this.fill === this.buffer.length) this.flush();
    }
    return true;
  }
}

registerProcessor(SYNTH_PROCESSOR, TeslaSynthProcessor);
registerProcessor(RECORDER_PROCESSOR, RecorderProcessor);
