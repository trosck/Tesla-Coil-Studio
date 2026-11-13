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
    types.ts              Preset
    builtIn.ts            BUILT_IN_PRESETS (10, typed with each mode's params), FEATURED_PRESET_IDS
    storage.ts            user presets in localStorage (observable)
    io.ts                 JSON export / import validation, planImport (dedupe + message)
    fileActions.ts        exportUserPresets / importPresetFile (Presets mode + Explorer toolbar)
  modes/
    registry.ts           tab order (imports `mode` from each folder; Presets first)
    <id>/index.tsx        one folder per mode: presets ramp pulse siren random
                          melody sequencer midi frequency
  components/
    ui/                   primitives: Button, Slider, NumberField/NumberInput, Select,
                          Toggle, SegmentedControl, Panel, Field, Icon (+ ui.css)
    shell/                WindowChrome (TitleBar, MenuBar), Header (aero brand band + status pill),
                          TaskPane (Coil modes = the mode tablist, Details, Other places),
                          Explorer (preset toolbar, address bar, active mode panel, status bar),
                          SavePresetDialog, SafetyNotice (SAFETY_TEXT), SetupGuide + guideStore,
                          StatusHelp, icons (pixel icons, mode orb glyphs, caption buttons),
                          nowShowing (useNowShowing: source mode + loaded preset name)
    desktop/              Desktop: Bubbles, DesktopIcons, Taskbar (start button, tray clock)
    transport/            TransportBar (player deck + LCD, Space shortcut, mobile bottom bar),
                          ExportDialog, exportStore (openExport / closeExport)
    visualizer/           Oscilloscope, Spectrum, Readouts, canvasLoop (drawn inside the deck LCD)
  lib/                    store.ts (observable), useStore.ts, persist.ts
  styles/                 tokens.css (CSS variables), y2k.css (shared Y2K classes), global.css
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
next unopened chunk = next loop boundary), `setLoop(b)` (turning loop back on
before the end was reached revives playback), `positionAt(frame)`,
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
→ `Float32Array`. One "loop" = one pass of the material: a `Sequence`, or all
`chunkCount` chunks of a finite source (a sequencer chain A→B); for endless
sources (`chunkCount: Infinity`) one loop = one chunk (`chunksPerLoop(p)`). `renderWav(p, {..., stereo})` → WAV `ArrayBuffer` (44.1 kHz,
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
used by Presets), so the transport plays the visible mode. The source mode is
persisted (`tcs.sourceMode.v1`) next to the active tab (`tcs.activeMode.v1`).
First visit: the Presets tab is shown and the source mode is Frequency (a
440 Hz test tone), see `defaultModeId` / `defaultSourceModeId` in `main.tsx`.

### Switching modes while playing (the rule)

Implemented in `StudioProvider` (one effect that syncs the transport):

| What happens | Transport playing | Transport paused |
| --- | --- | --- |
| Params of the source mode change | handed over at the next loop/chunk boundary (`liveUpdate: 'boundary'`) or re-cued at the same position (`'immediate'`) | new material is resumed at the paused position |
| Another mode tab is selected (source mode changes) | **restarts immediately** with the new mode from its beginning; stops if the new mode has nothing to play (e.g. MIDI without a file) | **stops** (rewinds), so PLAY starts the new mode from the beginning |
| A preset is loaded (`loadPreset`) | restarts immediately with the preset | stops |
| `loadPreset(p, { play: true })` ("Play" on a card) | always starts the preset from the beginning | ← same |
| The Presets tab is opened | nothing changes (it provides no material) | nothing changes |

Rationale: a boundary hand-over is right for tweaking a running sound, but a
mode switch is a deliberate "play something else" — waiting for the old
material's boundary (which can be minutes for a long siren pass) or
continuing to play a mode that is no longer visible would be confusing.

### Presets

`Preset<P> = { id, name, mode: ModeId, params: P, builtIn?, description?, createdAt? }`.

- Built-ins: `src/presets/builtIn.ts` (`BUILT_IN_PRESETS`, ids `builtin-*`,
  stable — never rename). Each carries the mode's COMPLETE params, typed with
  the mode's params interface (`RampParams`, …), so it passes the mode's
  `normalizeParams` unchanged; `builtIn.test.ts` checks that, that each one
  builds a playable with frequencies in 60–1600 Hz, and that it renders
  audibly below the ceiling. `FEATURED_PRESET_IDS` = the "Quick start" row.
- User presets: `src/presets/storage.ts` — `getUserPresets()`, `subscribePresets(cb)`
  (use with `useSyncExternalStore`), `saveUserPreset({ name, mode, params, description?, id? })`,
  `updateUserPreset(id, { name?, description? })` (rename, keeps order),
  `duplicatePreset(preset)`, `addUserPresets(list)` (import, fresh ids),
  `deleteUserPreset(id)`, `getPreset(id)`, `getAllPresets(mode?)`, `createPresetId()`.
  localStorage key `tcs.presets.v1`.
- Files: `src/presets/io.ts` — `serializePresets(list)` →
  `{ format: 'tesla-coil-studio-presets', version: 1, exportedAt, presets: [{ name, mode, params, description?, createdAt? }] }`;
  `parsePresetFile(text, normalize)` validates (format/version, mode ids, names,
  params passed through the target mode's `normalizeParams`; a bare array is
  accepted), returns `{ presets, invalid }` or throws a readable Error;
  `presetKey()` is used to skip duplicates on import; `planImport(parsed, existingKeys)`
  drops duplicates and builds the user-facing summary. `src/presets/fileActions.ts`
  wires it to storage and downloads: `exportUserPresets()` and
  `importPresetFile(file, modes)` return `{ kind: 'ok' | 'error', text }` (import
  also `added`); used by the Presets mode and the Explorer toolbar.
- Loading: `useStudio().loadPreset(preset, { play?, open? })` normalizes a
  deep copy of `preset.params` through the target mode's `normalizeParams`
  (built-ins are never mutated), stores them as that mode's params and switches
  to its tab (`open: false`: stays on the current tab and only makes it the
  source mode — used by the Presets tab's "Play"). `play: true` starts it
  (call from a click handler: it resumes the AudioContext inside the gesture).
  `useStudio().loadedPreset` = `{ id, mode, name }` of the last loaded preset.
  The mode simply receives the new `params` prop — no extra code in the mode.
  Saving: `saveUserPreset({ mode: sourceModeId, params: getParams(sourceModeId), name })`.

### Setup guide

`src/components/shell/SetupGuide.tsx`: modal `<dialog>` with the six setup
steps, tips and `SAFETY_TEXT`; "Play test signal" loads `builtin-test-signal`
with `play: true`. Open state lives in `guideStore.ts` (`openGuide()`,
`closeGuide()`); it opens automatically until dismissed once
(`tcs.guideSeen.v1`). The menu bar (Help, Setup guide…), the task pane's
"Other places", the "Setup guide.txt" desktop icon and the Presets mode link
call `openGuide()`. The Export WAV dialog works the same way through
`transport/exportStore.ts` (`openExport()` from the deck, the task pane and the
"WAV exports" desktop icon; `App` renders the dialog).

## 8. UI and styling conventions

- Look: light Windows XP / Y2K ("Tesla Coil Studio 2000") — the only theme,
  `color-scheme: light`. Bliss desktop (painted by `body::before` in
  `global.css`; never give `body`/`.app` an opaque background), a Luna window,
  chrome player deck with an LCD, XP task pane + white explorer, XP taskbar.
  Decorative mock elements with no real feature (caption buttons, File/Edit/
  View/Coil menus, address bar, Recycle Bin, quick launch) are `aria-hidden`
  non-interactive markup, never dead buttons.
- Plain CSS. Tokens in `src/styles/tokens.css`: colors (legacy names such as
  `--surface`, `--cyan` remapped to the light palette), radii, spacing,
  durations, fonts (`--font-ui` Tahoma/Verdana, `--font-lcd` VT323,
  `--font-display` Michroma; VT323 + Michroma load from Google Fonts in
  `index.html`), XP surfaces (`--win-*`, `--titlebar*`, `--menu-*`, `--tp-*`,
  `--field-*`, `--desk*`, `--taskbar`, `--tray*`), gradients (`--gel-*`,
  `--chrome*`), LCD (`--lcd-bg`, `--lcd-flat` for canvases, `--lcd-ink`,
  `--lcd-ink-dim/-faint`, `--lcd-border`) and a two-stop color per mode
  (`--mode-<id>-1/-2`, used by `.orb--<id>`). No hard-coded colors in
  component CSS. `src/styles/y2k.css` (imported by `ui.css`) holds the shared
  look-only classes: `.win .titlebar .wbtn .menu .aero .taskpane .tp-head
  .tp-body .gel(-blue/-green/-red/-silver) .flat .chrome .chrome-text .lcd
  .lcd-chip .chip .orb .burst .balloon .bubble .taskbar .tray .blink`. Global
  reset in `global.css`. Each component/feature imports its own CSS file next
  to it (`ui/ui.css`, `shell/shell.css`, `desktop/desktop.css`,
  `transport/transport.css`, `visualizer/visualizer.css`, `App.css`).
  Prefixes: `.ui-*` primitives, `.desk*`/`.app-*`/`.explorer*` frame, `.viz-*`
  visualizer, `.mode-<id>*` modes. No CSS modules.
- Primitives: `Button` variants `secondary` (silver gel), `primary` (blue),
  `danger` (red), `ghost` (`.flat`), `play` (green); `SegmentedControl` = gel
  row; `Panel` = task-pane group; inputs are XP style.
- Canvases (visualizer, piano roll, curves) read CSS variables at runtime.
- Accessibility: labeled controls (`Field`/`useId`), `role="switch"` toggles,
  `radiogroup` segmented controls with arrow keys, a vertical tablist for modes
  (task pane "Coil modes", arrows/Home/End; the explorer content is its
  tabpanel).
- **Space = play/pause** (TransportBar), except while typing (text inputs,
  textarea, select, contenteditable), on controls that Space activates
  (buttons, radios, switches, checkboxes, piano keys…) and while a modal dialog
  is open. It does work on the mode tabs (task pane) and on elements marked
  `data-space="transport"` (PLAY / PAUSE). The melody keyboard uses letter
  keys only, so there is no conflict.
- Layout: the task pane sits beside the explorer and wraps above it on narrow
  windows. ≤ 760 px the desktop icons and taskbar quick launch are hidden, the
  task pane lists modes in two columns, the deck's playback buttons become a
  fixed bottom bar (`.deck__buttons`) and `.desk` reserves bottom padding. Grids use
  `minmax(min(100%, Npx), 1fr)` so nothing forces horizontal scroll at 360 px;
  wide content (sequencer grid, melody timeline) scrolls inside its own container.
- The safety notice (`SafetyNotice`, exact `SAFETY_TEXT`) is always rendered as
  a dialog-style window below the main window; the deck's balloon tip (until
  audio starts) says the app controls only the audio signal.
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
