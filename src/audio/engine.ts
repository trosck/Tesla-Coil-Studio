/**
 * AudioEngine: the single owner of the AudioContext.
 *
 * Graph:  AudioWorkletNode('tesla-synth') -> master GainNode -> AnalyserNode -> destination
 *                                                  \-> AudioWorkletNode('tesla-recorder') (WAV capture)
 *
 * Audio goes to the OS default output device (which is how a Bluetooth
 * receiver such as the MH-M18 gets it). The browser has no Bluetooth control.
 *
 * Timing: a look-ahead timer (25 ms tick, ~150 ms horizon) only decides WHAT
 * to send; every event is stamped with absolute sample frames and the worklet
 * renders it sample-accurately with the shared SynthCore.
 */
import workletUrl from './worklet/teslaSynth.worklet.ts?worker&url';
import { encodeMonoWav } from './export/wavEncoder';
import { clampDuty } from './dsp/synthCore';
import { freqToNearestNote } from './music';
import { Scheduler, secondsToFrames, type SchedulerPosition } from './scheduler';
import { createStore, type Store } from '../lib/store';
import type { Playable, Waveform } from './types';
import {
  RECORDER_PROCESSOR,
  SYNTH_PROCESSOR,
  type RecorderInMessage,
  type RecorderOutMessage,
  type SynthInMessage,
  type SynthOutMessage,
  type SynthProcessorOptions,
} from './worklet/protocol';

export type AudioStatus =
  | 'uninitialized'
  | 'starting'
  | 'running'
  | 'suspended'
  | 'interrupted'
  | 'closed'
  | 'unsupported'
  | 'error';

export interface PlaybackState {
  audioStatus: AudioStatus;
  sampleRate: number | null;
  error: string | null;

  isPlaying: boolean;
  isPaused: boolean;
  loop: boolean;
  /** Seconds into the current chunk / loop. */
  position: number;
  /** Length in seconds of the current chunk / loop. */
  length: number;
  chunkIndex: number;
  bpm: number | null;
  label: string | null;

  /** What the worklet is actually rendering right now (~60 Hz updates). */
  frequency: number;
  noteName: string;
  cents: number;
  amplitude: number;
  eventIndex: number;
  step: number;
  liveNote: boolean;

  masterVolume: number;
  waveform: Waveform;
  duty: number;

  isRecording: boolean;
  recordingSeconds: number;

  outputDeviceId: string;
}

export interface PlayOptions {
  /** Defaults to the current transport loop state. */
  loop?: boolean;
}

export interface UpdateOptions {
  /** Re-cue now (keeping the position) instead of waiting for the next loop boundary. */
  immediate?: boolean;
}

export interface OutputDevice {
  deviceId: string;
  label: string;
}

const TICK_MS = 25;
const HORIZON_S = 0.15;
const HIDDEN_HORIZON_S = 1.2;
const LEAD_S = 0.05;

interface SinkCapableContext extends AudioContext {
  setSinkId(id: string): Promise<void>;
  sinkId?: string;
}

const initialState: PlaybackState = {
  audioStatus: typeof AudioContext === 'undefined' ? 'unsupported' : 'uninitialized',
  sampleRate: null,
  error: null,
  isPlaying: false,
  isPaused: false,
  loop: true,
  position: 0,
  length: 0,
  chunkIndex: 0,
  bpm: null,
  label: null,
  frequency: 0,
  noteName: '',
  cents: 0,
  amplitude: 0,
  eventIndex: -1,
  step: -1,
  liveNote: false,
  masterVolume: 0.8,
  waveform: 'square',
  duty: 0.5,
  isRecording: false,
  recordingSeconds: 0,
  outputDeviceId: '',
};

export class AudioEngine {
  readonly store: Store<PlaybackState> = createStore<PlaybackState>(initialState);

  private ctx: AudioContext | null = null;
  private synth: AudioWorkletNode | null = null;
  private master: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private recorder: AudioWorkletNode | null = null;
  private startPromise: Promise<void> | null = null;

  private scheduler: Scheduler | null = null;
  private playable: Playable | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private finishSent = false;
  private pausedAt: SchedulerPosition | null = null;

  private recChunks: Float32Array[] = [];
  private recFrames = 0;
  private recStopResolve: (() => void) | null = null;

  get state(): PlaybackState {
    return this.store.getSnapshot();
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get analyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  /** The Playable currently loaded in the transport (playing or paused). */
  get currentPlayable(): Playable | null {
    return this.playable;
  }

  get isReady(): boolean {
    return this.ctx !== null && this.ctx.state === 'running' && this.synth !== null;
  }

  // ------------------------------------------------------------ lifecycle

  /**
   * Create (first call) and/or resume the AudioContext. MUST be called from a
   * user gesture handler the first time (browser autoplay policy). All
   * transport methods call it for you.
   */
  ensureStarted(): Promise<void> {
    if (this.ctx && this.synth) {
      if (this.ctx.state !== 'running') {
        return this.ctx.resume().then(
          () => this.syncStatus(),
          (e: unknown) => this.fail(e),
        );
      }
      return Promise.resolve();
    }
    if (!this.startPromise) this.startPromise = this.init();
    return this.startPromise;
  }

  private async init(): Promise<void> {
    if (typeof AudioContext === 'undefined') {
      this.store.setState({ audioStatus: 'unsupported' });
      throw new Error('Web Audio is not supported in this browser');
    }
    this.store.setState({ audioStatus: 'starting', error: null });
    try {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      // resume() first so that it happens inside the user gesture.
      const resumed = ctx.resume();
      await ctx.audioWorklet.addModule(workletUrl);
      await resumed;
      const s = this.state;
      const processorOptions: SynthProcessorOptions = { waveform: s.waveform, duty: s.duty, statusRate: 60 };
      const synth = new AudioWorkletNode(ctx, SYNTH_PROCESSOR, {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions,
      });
      const master = ctx.createGain();
      master.gain.value = s.masterVolume;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.7;
      const recorder = new AudioWorkletNode(ctx, RECORDER_PROCESSOR, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
      });
      synth.connect(master);
      master.connect(analyser);
      analyser.connect(ctx.destination);
      master.connect(recorder);
      recorder.connect(ctx.destination); // silent output; keeps the node pulled

      synth.port.onmessage = (e: MessageEvent<SynthOutMessage>) => this.onSynthMessage(e.data);
      recorder.port.onmessage = (e: MessageEvent<RecorderOutMessage>) => this.onRecorderMessage(e.data);
      ctx.addEventListener('statechange', () => this.syncStatus());
      document.addEventListener('visibilitychange', () => this.tick());

      this.synth = synth;
      this.master = master;
      this.analyserNode = analyser;
      this.recorder = recorder;
      this.store.setState({ sampleRate: ctx.sampleRate });
      this.syncStatus();
    } catch (e) {
      this.startPromise = null;
      this.fail(e);
      throw e;
    }
  }

  private fail(e: unknown): void {
    this.store.setState({ audioStatus: 'error', error: e instanceof Error ? e.message : String(e) });
  }

  private syncStatus(): void {
    const st = this.ctx?.state as string | undefined;
    const audioStatus: AudioStatus =
      st === 'running' ? 'running' : st === 'suspended' ? 'suspended' : st === 'closed' ? 'closed' : st === 'interrupted' ? 'interrupted' : this.state.audioStatus;
    this.store.setState({ audioStatus });
  }

  private post(msg: SynthInMessage): void {
    this.synth?.port.postMessage(msg);
  }

  private nowFrame(): number {
    const ctx = this.ctx!;
    return Math.round(ctx.currentTime * ctx.sampleRate);
  }

  // ------------------------------------------------------------ transport

  /** Start playing a Sequence / SequenceSource from the beginning. */
  async play(playable: Playable, opts: PlayOptions = {}): Promise<void> {
    await this.ensureStarted();
    const loop = opts.loop ?? this.state.loop;
    this.haltScheduling();
    this.playable = playable;
    this.startScheduler(this.nowFrame() + secondsToFrames(LEAD_S, this.ctx!.sampleRate), { loop });
    this.store.setState({ isPlaying: true, isPaused: false, loop, label: playable.label ?? null, bpm: playable.bpm ?? null });
    this.startTimer();
    this.tick();
  }

  /** Pause, remembering the position. */
  pause(): void {
    if (!this.state.isPlaying || !this.ctx || !this.scheduler) return;
    const now = this.nowFrame();
    this.pausedAt = this.scheduler.positionAt(now);
    this.post({ type: 'truncate', frame: now });
    this.stopTimer();
    this.scheduler.reset();
    this.store.setState({ isPlaying: false, isPaused: true });
  }

  /** Resume from the paused position. */
  async resume(): Promise<void> {
    if (!this.state.isPaused || !this.playable) return;
    await this.ensureStarted();
    const at = this.pausedAt;
    this.pausedAt = null;
    this.startScheduler(this.nowFrame() + secondsToFrames(LEAD_S, this.ctx!.sampleRate), {
      loop: this.state.loop,
      offsetSeconds: at?.seconds ?? 0,
      chunkIndex: at?.chunkIndex ?? 0,
    });
    this.store.setState({ isPlaying: true, isPaused: false });
    this.startTimer();
    this.tick();
  }

  /** Stop and rewind. Keeps the loaded playable (play() again restarts it). */
  stop(): void {
    this.haltScheduling();
    this.pausedAt = null;
    this.store.setState({
      isPlaying: false,
      isPaused: false,
      position: 0,
      chunkIndex: 0,
      eventIndex: -1,
      step: -1,
    });
  }

  setLoop(loop: boolean): void {
    this.scheduler?.setLoop(loop);
    this.store.setState({ loop });
  }

  /**
   * Replace the material while playing. By default it takes effect at the next
   * loop/chunk boundary; `immediate` re-cues now at the same position.
   * When not playing it just becomes the loaded playable.
   */
  updatePlayable(playable: Playable, opts: UpdateOptions = {}): void {
    this.playable = playable;
    this.store.setState({ label: playable.label ?? null, bpm: playable.bpm ?? null });
    if (!this.state.isPlaying || !this.scheduler || !this.ctx) return;
    if (opts.immediate) {
      const f = this.nowFrame() + secondsToFrames(LEAD_S, this.ctx.sampleRate);
      const pos = this.scheduler.positionAt(f);
      this.post({ type: 'truncate', frame: f });
      this.startScheduler(f, {
        loop: this.state.loop,
        offsetSeconds: pos?.seconds ?? 0,
        chunkIndex: pos?.chunkIndex ?? 0,
      });
      this.tick();
    } else {
      this.scheduler.setPlayable(playable);
    }
  }

  private startScheduler(startFrame: number, o: { loop: boolean; offsetSeconds?: number; chunkIndex?: number }): void {
    if (!this.playable || !this.ctx) return;
    if (!this.scheduler) this.scheduler = new Scheduler(this.ctx.sampleRate);
    this.scheduler.start(this.playable, { startFrame, ...o });
    this.finishSent = false;
  }

  private haltScheduling(): void {
    this.stopTimer();
    this.scheduler?.reset();
    if (this.ctx) this.post({ type: 'clear' });
  }

  private startTimer(): void {
    if (this.timer === null) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Look-ahead: send everything due within the horizon. Safe to call any time. */
  private tick(): void {
    const sched = this.scheduler;
    if (!this.ctx || !sched || !sched.isStarted || !this.state.isPlaying) return;
    const sr = this.ctx.sampleRate;
    const now = this.nowFrame();
    const hidden = typeof document !== 'undefined' && document.hidden;
    const horizon = secondsToFrames(hidden ? HIDDEN_HORIZON_S : HORIZON_S, sr);
    const events = sched.advance(now + horizon);
    if (events.length > 0) this.post({ type: 'schedule', events });
    if (sched.endFrame !== null && !this.finishSent) {
      this.post({ type: 'truncate', frame: sched.endFrame });
      this.finishSent = true;
    }
    const pos = sched.positionAt(now);
    if (pos) {
      this.store.setState({
        position: pos.seconds,
        length: pos.length,
        chunkIndex: pos.chunkIndex,
        bpm: pos.bpm ?? null,
      });
    }
    if (sched.endFrame !== null && now >= sched.endFrame) {
      this.stop();
    }
  }

  // ------------------------------------------------------------ live settings

  setMasterVolume(v: number): void {
    const vol = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.015);
    this.store.setState({ masterVolume: vol });
  }

  /** Global waveform for events that do not set their own. Immediate. */
  setWaveform(waveform: Waveform): void {
    this.post({ type: 'setWaveform', waveform });
    this.store.setState({ waveform });
  }

  /** Global square duty cycle (0.01..0.99) for events that do not set their own. Immediate. */
  setDuty(duty: number): void {
    const d = clampDuty(duty);
    this.post({ type: 'setDuty', duty: d });
    this.store.setState({ duty: d });
  }

  /** Immediate held note (piano / test tone). Overrides the sequence until the next event starts. */
  noteOn(freq: number, gain = 0.8): void {
    if (this.isReady) {
      this.post({ type: 'noteOn', freq, gain });
      return;
    }
    this.ensureStarted().then(
      () => this.post({ type: 'noteOn', freq, gain }),
      () => undefined,
    );
  }

  noteOff(): void {
    this.post({ type: 'noteOff' });
  }

  private onSynthMessage(msg: SynthOutMessage): void {
    if (msg.type !== 'status') return;
    const note = msg.active ? freqToNearestNote(msg.freq) : null;
    this.store.setState({
      frequency: msg.active ? msg.freq : 0,
      amplitude: msg.amp,
      noteName: note?.name ?? '',
      cents: note?.cents ?? 0,
      eventIndex: msg.eventIndex,
      step: msg.step,
      liveNote: msg.live,
    });
    this.tick(); // message port is not throttled in background tabs
  }

  // ------------------------------------------------------------ recording

  /** Start capturing the master output. */
  async startRecording(): Promise<void> {
    await this.ensureStarted();
    if (this.state.isRecording) return;
    this.recChunks = [];
    this.recFrames = 0;
    this.recorder?.port.postMessage({ type: 'start' } satisfies RecorderInMessage);
    this.store.setState({ isRecording: true, recordingSeconds: 0 });
  }

  /** Stop capturing; resolves to a mono 16-bit WAV Blob (null if nothing was recorded). */
  async stopRecording(): Promise<Blob | null> {
    if (!this.state.isRecording || !this.recorder || !this.ctx) return null;
    const stopped = new Promise<void>((resolve) => {
      this.recStopResolve = resolve;
      setTimeout(resolve, 1000); // safety
    });
    this.recorder.port.postMessage({ type: 'stop' } satisfies RecorderInMessage);
    await stopped;
    this.recStopResolve = null;
    this.store.setState({ isRecording: false });
    if (this.recFrames === 0) return null;
    const all = new Float32Array(this.recFrames);
    let o = 0;
    for (const c of this.recChunks) {
      all.set(c, o);
      o += c.length;
    }
    this.recChunks = [];
    return new Blob([encodeMonoWav(all, this.ctx.sampleRate)], { type: 'audio/wav' });
  }

  private onRecorderMessage(msg: RecorderOutMessage): void {
    if (msg.type === 'data') {
      if (!this.state.isRecording) return;
      this.recChunks.push(msg.samples);
      this.recFrames += msg.samples.length;
      this.store.setState({ recordingSeconds: this.recFrames / (this.ctx?.sampleRate ?? 48000) });
    } else if (msg.type === 'stopped') {
      this.recStopResolve?.();
    }
  }

  // ------------------------------------------------------------ output device

  /** True when the browser supports AudioContext.setSinkId (output selection). */
  get supportsOutputSelection(): boolean {
    return typeof AudioContext !== 'undefined' && typeof (AudioContext.prototype as Partial<SinkCapableContext>).setSinkId === 'function';
  }

  async listOutputDevices(): Promise<OutputDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audiooutput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || (d.deviceId === 'default' ? 'System default' : `Output ${i + 1}`) }));
  }

  /** '' = system default output. */
  async setOutputDevice(deviceId: string): Promise<void> {
    await this.ensureStarted();
    if (!this.supportsOutputSelection || !this.ctx) return;
    await (this.ctx as SinkCapableContext).setSinkId(deviceId);
    this.store.setState({ outputDeviceId: deviceId });
  }
}

let instance: AudioEngine | null = null;

/** The app-wide engine singleton (no AudioContext is created until ensureStarted()). */
export function getEngine(): AudioEngine {
  if (!instance) instance = new AudioEngine();
  return instance;
}
