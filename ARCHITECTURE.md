# Tesla Coil Studio — Architecture

Browser-only (no backend) audio generator for Bluetooth musical Tesla coils
(e.g. MH-M18 receiver). The app produces an audio signal on the OS default
output; the OS sends it over Bluetooth; the coil modulates its arc from it.
The app never controls the coil, its voltage or Bluetooth directly.

Stack: React 19 + TypeScript (strict) + Vite, Vitest, ESLint (flat,
typescript-eslint + react-hooks). Plain CSS. Runtime deps: `react`,
`react-dom`, `@tonejs/midi` (for the MIDI mode).

```
Mode panel (params) --build()--> Playable (Sequence | SequenceSource)
        |                                   |
        |                     +-------------+--------------+
        v                     v                            v
  StudioProvider ----> AudioEngine (live)            renderWav (export)
                        Scheduler (look-ahead)       Scheduler (block loop)
                        -> postMessage CoreEvents    -> SynthCore.render()
                        -> AudioWorklet: SynthCore   -> wavEncoder (16-bit PCM)
```

Live playback and export run the **same Scheduler and the same SynthCore on
the same event data**, so an export sounds like what you heard.

## Directory layout

```
src/
  audio/
    types.ts              ToneEvent, Sequence, SequenceSource, Playable, Waveform, GlideCurve
    music.ts              note/MIDI/frequency, scales + quantize, seeded PRNG
    scheduler.ts          pure Playable -> CoreEvent[] (absolute sample frames)
    engine.ts             AudioEngine singleton (AudioContext, transport, store, recording)
    dsp/synthCore.ts      pure mono synth (shared by worklet and export)
    worklet/
      teslaSynth.worklet.ts  AudioWorklet entry: 'tesla-synth' + 'tesla-recorder'
      protocol.ts            message types main <-> worklet
    export/
      renderWav.ts        offline render + download helpers
      wavEncoder.ts       pure 16-bit PCM WAV encoder
  studio/
    types.ts              ModeId, ModeDefinition, ModePanelProps, defineMode
    StudioContext.ts      useStudio(), usePlayback()
    StudioProvider.tsx    params state, active/source mode, presets, transport glue
    ModeHost.tsx          renders a mode's Panel with its props
    params.ts             params normalization + localStorage persistence
    settings.ts           persists volume / waveform / duty / loop
  presets/
    types.ts  storage.ts  builtIn.ts
  modes/
    registry.ts           tab order (imports `mode` from each folder)
    <id>/index.tsx        one folder per mode: ramp pulse siren random melody
                          sequencer midi frequency presets
  components/
    ui/                   primitives: Button, Slider, NumberField/NumberInput, Select,
                          Toggle, SegmentedControl, Panel, Field, Icon (+ ui.css)
    shell/                Header, ModeTabs, SafetyNotice
    transport/            TransportBar, ExportDialog
    visualizer/           Oscilloscope, Spectrum, Readouts, canvasLoop
    ModeStub.tsx          "Coming soon" placeholder
  lib/                    store.ts (observable), useStore.ts, persist.ts
  styles/                 tokens.css (CSS variables), global.css
```

## 1. Event model (`src/audio/types.ts`)

```ts
type Waveform = 'square' | 'sine' | 'triangle' | 'sawtooth';
type GlideCurve = 'linear' | 'exponential' | 'logarithmic';

interface ToneEvent {
  time: number;        // s from chunk start
  duration: number;    // s, > 0
  freqStart: number;   // Hz
  freqEnd?: number;    // Hz; glide target
  curve?: GlideCurve;  // default 'linear'
  gain: number;        // 0..1
  waveform?: Waveform; // omit => global transport waveform (recommended)
  duty?: number;       // 0.01..0.99; omit => global duty
  step?: number;       // reported back as PlaybackState.step
}
interface Sequence { events: ToneEvent[]; length: number; bpm?: number; loop?: boolean; label?: string }
interface SequenceSource { kind: 'source'; chunk(index: number): Sequence; chunkCount?: number; bpm?; loop?; label? }
type Playable = Sequence | SequenceSource;
```

Rules:

- **Monophonic.** If events overlap, the later-starting event wins (cuts the earlier one, no gap).
- **Silence = no event.** Between events the output is exactly `0`.
- **Legato rule:** events that touch (`a.time + a.duration === b.time`) or overlap
  play without a release/attack dip and with continuous phase. For audible
  articulation (e.g. repeated sequencer notes) leave a gap — use
  `duration < step length` (a "gate").
- `length` is the loop length including trailing silence. Events with
  `time >= length` are ignored; durations may extend past `length`.
- `Sequence.loop` is informational; the transport LOOP toggle decides.
- `label` is used for the export filename.

**Generative / long material:** `SequenceSource` produces successive chunks.
`chunk(i)` is called once per playback right before chunk *i* is due and must
be deterministic for a given index (seed it: `createRng(seed + i)`), so export
equals live playback. Loop ON → chunks 0,1,2,… forever. Loop OFF → chunks
`0..chunkCount-1` (only chunk 0 when `chunkCount` is undefined). A plain
`Sequence` is a 1-chunk source (`toSource()`).

## 2. DSP core (`src/audio/dsp/synthCore.ts`)

`SynthCore` is pure TS, sample-frame based (`core.frame` = absolute frame of
the next sample). Used by the worklet AND the offline renderer.

- Phase accumulator `phase ∈ [0,1)`, `dt = f / sampleRate`, f clamped to `[1 Hz, Nyquist]`.
- Waveforms (`oscillatorSample`):
  - square with duty `d`: `+1` for `phase < d`, else `-1`, both edges PolyBLEP corrected;
  - sawtooth: `2·phase − 1 − polyBLEP(phase)`;
  - sine: `sin(2π·phase)`; triangle: `1 − 4·|((phase+0.25) mod 1) − 0.5|` (starts at 0).
- Glide (`glideFrequency(f0, f1, t, curve)`, `t = (n − startFrame)/(endFrame − startFrame)` clamped to [0,1]):
  - linear: `f0 + (f1 − f0)·t`
  - exponential: `f0·(f1/f0)^t` (constant pitch speed; f ≥ 1 Hz)
  - logarithmic: `f0 + (f1 − f0)·log10(1 + 9t)` (fast at the start, slow at the end)
  - all hit `f0` at t=0 and `f1` at t=1 exactly.
- Envelope: linear attack (default 3 ms) from the amplitude at activation
  (0 after silence) to `gain`; linear release (default 3 ms) ending exactly at
  `endFrame` (skipped for legato). Ramps shrink to ≤ half the event for very
  short events. Phase resets to 0 only when starting from silence.
- Output = `wave · amp · masterGain · ceiling`, hard-clamped to `±ceiling`
  (`DEFAULT_CEILING = 0.9`). Never clips.
- Global `waveform` / `duty` (`setWaveform`, `setDuty`) apply to events without
  their own value, take effect immediately (resolved at render time).
- Queue API: `schedule(CoreEvent[])`, `truncate(frame)` (cut everything at frame,
  never sooner than one release from now), `clear()`, `noteOn(freq, gain)`,
  `noteOff()`, `render(out, count, offset)`, `getStatus()`.

`CoreEvent` = ToneEvent resolved to frames: `startFrame` (t=0 of the glide),
`activateFrame` (when it becomes audible; later than start when resuming
mid-event), `endFrame` (exclusive, `Infinity` for held live notes), `index`,
`chunk`, `step`, `live`.

## 3. Scheduler (`src/audio/scheduler.ts`)

Pure and deterministic. `start(playable, {startFrame, loop, offsetSeconds?, chunkIndex?, maxChunks?})`,
`advance(untilFrame): CoreEvent[]` (everything with activation < untilFrame not
yet emitted, opening chunks as needed), `setPlayable(p)` (takes effect at the
next unopened chunk = next loop boundary), `setLoop(b)`, `positionAt(frame)`,
`endFrame` (set once the last chunk is known). Frames: `round(seconds · sr)`;
chunk *k+1* starts at `chunkStart_k + round(length_k · sr)`.
`clipEvents(events, cutFrame)` cuts events at a frame.

## 4. Engine (`src/audio/engine.ts`)

`getEngine()` returns the singleton `AudioEngine`. No AudioContext exists until
`ensureStarted()` is called from a user gesture (all transport methods call it).

Graph: `AudioWorkletNode('tesla-synth')` → master `GainNode` → `AnalyserNode`
(fftSize 4096) → destination; master → `AudioWorkletNode('tesla-recorder')`.

The worklet module is imported with `?worker&url`, so Vite bundles it (with the
SynthCore inlined) as `dist/assets/teslaSynth.worklet-*.js` and serves it as an
ES module in dev; `audioWorklet.addModule(url)` loads it.

Scheduling: 25 ms `setInterval` tick (also driven by worklet status messages,
which are not throttled in background tabs); horizon 150 ms (1.2 s while the
tab is hidden); playback starts 50 ms ahead. The timer only decides WHAT to
send; timing comes from frame stamps rendered by the worklet.

Public API:

```ts
engine.store: Store<PlaybackState>             // subscribe/getSnapshot (useSyncExternalStore)
engine.state: PlaybackState                    // current snapshot
engine.context / engine.analyser / engine.currentPlayable / engine.isReady
ensureStarted(): Promise<void>
play(p: Playable, opts?: { loop?: boolean }): Promise<void>
pause(): void                                  // remembers position (chunk + seconds)
resume(): Promise<void>                        // continues from that position
stop(): void                                   // release + rewind; keeps currentPlayable
setLoop(b) / setMasterVolume(0..1) / setWaveform(w) / setDuty(0.01..0.99)
updatePlayable(p, { immediate?: boolean })     // default: next loop boundary
noteOn(freq, gain = 0.8) / noteOff()           // immediate live notes (piano, test tone)
startRecording(): Promise<void>
stopRecording(): Promise<Blob | null>          // mono 16-bit WAV at context rate
supportsOutputSelection / listOutputDevices() / setOutputDevice(id)  // setSinkId, feature-detected
```

`PlaybackState`: `audioStatus` ('uninitialized'|'starting'|'running'|'suspended'|
'interrupted'|'closed'|'unsupported'|'error'), `sampleRate`, `error`,
`isPlaying`, `isPaused`, `loop`, `position` (s in current chunk), `length`,
`chunkIndex`, `bpm`, `label`, `frequency`, `noteName`, `cents`, `amplitude`,
`eventIndex`, `step`, `liveNote`, `masterVolume`, `waveform`, `duty`,
`isRecording`, `recordingSeconds`, `outputDeviceId`. The worklet posts
frequency/amplitude/event index ~60×/s while sounding.

Pause is position-tracking (not `ctx.suspend()`), so the Bluetooth link stays
awake and `noteOn` works while paused.

## 5. Export (`src/audio/export/`)

`renderPlayable(p, { loops? | durationSeconds?, volume, waveform, duty, sampleRate=44100 })`
→ `Float32Array`; `renderWav(p, {..., stereo})` → WAV `ArrayBuffer` (44.1 kHz,
16-bit PCM, mono or duplicated stereo). Max 600 s. `encodeWav(channels, {sampleRate})`
/ `encodeMonoWav(samples, sr, stereo)` / `floatTo16`. `downloadBlob(data, name)`,
`timestampedName(prefix)`. The export dialog passes the transport's current
waveform and duty.

## 6. Music utilities (`src/audio/music.ts`)

`midiToFreq`, `freqToMidi`, `midiToNoteName` (60 = "C4"), `noteNameToMidi`
("C#4", "Db5", "A-1"; default octave 4), `noteNameToFreq`, `freqToNearestNote`
→ `{ midi, name, cents, freq }`, `SCALES` / `SCALE_LIST` (`c-major`, `a-minor`,
`c-minor`, `d-minor`, `pentatonic` (C major pentatonic), `chromatic`),
`isInScale`, `quantizeMidi` (ties resolve down), `quantizeFreq`,
`scaleNotesInRange`, `scaleDegreeToMidi`, `beatSeconds`, `stepSeconds`,
`mulberry32(seed)`, `hashSeed(str)`, `createRng(seed)` → `{ next, range, int, pick, chance }`.

## 7. How to implement a mode panel

You only edit files inside `src/modes/<id>/` (and add tests there). The
registry (`src/modes/registry.ts`) already imports `mode` from each folder.

1. `src/modes/<id>/index.tsx` must export `mode` created with `defineMode`:

```ts
import { defineMode, type ModePanelProps } from '../../studio/types';

export interface RampParams { from: number; to: number; seconds: number; curve: GlideCurve }

function RampPanel({ params, setParams }: ModePanelProps<RampParams>) { ... }

export const mode = defineMode<RampParams>({
  id: 'ramp',                     // fixed: the folder name (ModeId)
  label: 'Ramp',
  description: 'One line shown above the panel.',
  defaultParams: { from: 100, to: 1000, seconds: 2, curve: 'exponential' },
  normalizeParams: (raw: unknown) => RampParams,   // optional, recommended (validate stored/preset data)
  build: (p) => Sequence | SequenceSource | null,  // preferred: pure, unit-test it
  liveUpdate: 'boundary',          // or 'immediate' (re-cue at the same position)
  Panel: RampPanel,
});
```

2. `ModePanelProps<P>`: `{ params: P; setParams(next: P | (prev: P) => P); setPlayable(p: Playable | null) }`.
   - Keep all UI state that should survive reloads / be saved in presets in
     `params` (JSON-serializable). The shell persists every mode's params to
     localStorage (`tcs.modeParams.v1`) automatically; stored data passes
     through `normalizeParams` (default: shallow-merge over `defaultParams`).
   - Transient UI state may use local `useState`.
3. **Producing sound:** implement `build(params)`. The shell calls it whenever
   params change; the result is what PLAY and EXPORT WAV use while this tab is
   the source mode, and it is pushed to a running transport (at the next loop
   boundary, or immediately with `liveUpdate: 'immediate'`). Return `null` to
   disable PLAY/EXPORT. Modes without `build` (e.g. MIDI with file data not
   kept in params) call `setPlayable(p)` instead (not persisted).
4. Extra hooks, from `../../studio/StudioContext`:
   - `useStudio()` → `{ engine, modes, activeModeId, setActiveMode, sourceModeId, activePlayable,
     getParams(id), setModeParams(id, next), resetModeParams(id), loadPreset(preset),
     play(), pause(), stop(), playPlayable(p, opts?) }`
   - `usePlayback(selector)` → slice of `PlaybackState`, e.g.
     `usePlayback((s) => s.step)` to highlight the current sequencer step
     (set `ToneEvent.step`), `s.isPlaying`, `s.position`, `s.frequency`.
     Return primitives from the selector.
   - Live playing (piano keys, hold-to-test): `engine.noteOn(freq, gain)` / `engine.noteOff()`.
5. Utilities: `src/audio/music.ts` (notes, scales, PRNG), UI primitives from
   `src/components/ui` (`Button`, `Slider` (supports `scale="log"`), `NumberField`,
   `NumberInput`, `Select`, `Toggle`, `SegmentedControl`, `Panel`, `Field`, `Icon`).
6. Styling: create `src/modes/<id>/<id>.css`, import it from your component,
   prefix classes with `mode-<id>-` / `.mode-<id>__x`, use the CSS variables
   from `src/styles/tokens.css`.
7. Tests: `src/modes/<id>/*.test.ts` (Vitest, node environment — test the pure
   `build` / helpers; see `src/modes/frequency/build.test.ts`, which renders
   with `renderPlayable` and counts zero crossings).

Selecting a tab makes it the **source mode** (unless `providesPlayable: false`,
used by Presets), so the transport plays the visible mode.

### Presets

`Preset<P> = { id, name, mode: ModeId, params: P, builtIn?, description?, createdAt? }`.

- Built-ins: `src/presets/builtIn.ts` (`BUILT_IN_PRESETS`, ids `builtin-*`).
- User presets: `src/presets/storage.ts` — `getUserPresets()`, `subscribePresets(cb)`
  (use with `useSyncExternalStore`), `saveUserPreset({ name, mode, params, id? })`,
  `deleteUserPreset(id)`, `getPreset(id)`, `getAllPresets(mode?)`, `createPresetId()`.
  localStorage key `tcs.presets.v1`.
- Loading: `useStudio().loadPreset(preset)` normalizes `preset.params` through
  the target mode's `normalizeParams`, stores them as that mode's params and
  switches to its tab. The mode simply receives the new `params` prop — no
  extra code in the mode. Saving: `saveUserPreset({ mode: sourceModeId, params: getParams(sourceModeId), name })`.

## 8. UI and styling conventions

- Plain CSS. Tokens in `src/styles/tokens.css` (colors, radii, spacing, fonts,
  durations); global reset in `global.css`. Each component/feature imports its
  own CSS file next to it (`ui/ui.css`, `transport/transport.css`,
  `visualizer/visualizer.css`, `App.css`). Prefixes: `.ui-*` primitives,
  `.app-*` shell, `.viz-*` visualizer, `.mode-<id>*` modes. No CSS modules.
- Accessibility: labeled controls (`Field`/`useId`), `role="switch"` toggles,
  `radiogroup` segmented controls with arrow keys, tablist for modes, Space =
  play/pause when no control is focused.
- Visualizers use `startCanvasLoop` (rAF, devicePixelRatio, ResizeObserver,
  skips work when hidden/off-screen).

## 9. Known limitations

- Export renders synchronously on the main thread (≤ 600 s); a long export
  while playing can cause a short live dropout.
- The live AudioContext runs at the device rate (often 48 kHz); export is
  44.1 kHz. Same events and core, so it sounds the same, but samples are not
  bit-identical.
- Displayed position/frequency do not compensate output latency (Bluetooth adds
  ~100–300 ms that browsers usually cannot measure).
- `noteOn` overrides the sequence only until the next sequence event starts.
- Output device selection needs `AudioContext.setSinkId` (Chromium); device
  labels may be generic without media permission.
