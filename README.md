# Tesla Coil Studio

A browser-only music generator for Bluetooth musical Tesla coils (for example
kits with an **MH-M18** Bluetooth audio receiver). It generates clean,
band-limited audio signals (square wave by default) in real time, shows what is
playing on a live oscilloscope and spectrum, records the output, and exports
WAV files. No backend, no account: everything runs in your browser.

**Live app:** https://trosck.github.io/Tesla-Coil-Studio/

The coil modulates its arc from the incoming audio. The app only produces
audio on your device's normal sound output; your operating system sends it to
the coil over Bluetooth. The app never controls the coil, its power or the
Bluetooth connection directly.

## Quick start

```bash
pnpm install && pnpm dev     # open the printed URL
```

Build for production:

```bash
pnpm build                   # type-checks, then writes the static site to dist/
pnpm preview                 # serve dist/ locally
```

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test`.

The app opens on the **Presets** tab: pick a preset, press **▶ Play**.

## Setup guide (summary)

The full guide is built in: click **Setup guide** in the header (it opens
automatically on your first visit).

1. **Pair** your computer or phone with the MH-M18 receiver in the system
   Bluetooth settings (it usually shows up as "MH-M18"; PIN `0000` if asked).
2. **Select it as the audio output** (macOS: Control Center → Sound; Windows:
   Sound output; phones switch automatically). In Chrome/Edge you can also pick
   it with the output selector in the header once audio is enabled.
3. Set the coil's switch to **Music mode**.
4. Set the **system volume moderately** (≈50%) and raise it slowly.
5. **Pick a preset** — *Test Signal* (steady 440 Hz) is ideal for a first check.
6. Press **Play** (or Space). The first click/tap also unlocks browser audio;
   if audio gets suspended or fails to start, pressing **Play** resumes or
   retries it.

Tips: the square wave gives the clearest arcs; avoid very high volume
(clipping/distortion); Bluetooth adds about 100–300 ms of latency, so the
visuals may lead the sound; on phones keep the screen on and the tab in the
foreground; use **EXPORT WAV** to play tracks from any music player.

## Features

- **Preset library** (Presets tab): 10 built-in presets — Frequency Ramp, Fast
  Pulse, Slow Pulse, Rising / Falling / Alternating Siren, Electronic Rhythm,
  Random Lightning, Arpeggio, Test Signal — grouped and filterable by mode,
  searchable. One-click **Play** (audition without leaving the tab) or **Edit**
  (opens the preset in its mode; built-ins are never modified). Save the
  current settings of any mode as your own preset, rename, duplicate, delete,
  and export/import your presets as a JSON file (validated on import).
- **Modes**: Ramp, Pulse, Siren, Random (seeded, scale-quantized), Melody
  (piano keyboard + computer keys, recording, timeline editor), Step
  Sequencer (4 pattern slots, chaining, swing), MIDI import (monophonic
  reduction, piano roll), Frequency (steady tone, sweep, step list, converter).
- **Transport**: play, pause/resume, stop, loop, record the output to WAV,
  export WAV (44.1 kHz / 16-bit PCM, mono or stereo, by loops or duration,
  adjustable volume). Space = play/pause. On phones the playback buttons stay
  in a fixed bar at the bottom of the screen.
- Global waveform (square / sine / triangle / saw) and duty cycle.
- Live oscilloscope, spectrum, big frequency readout with note and cents,
  amplitude meter, BPM, loop counter and position.
- Output never clips: a fixed master ceiling keeps the signal below full scale.

Developers: see [ARCHITECTURE.md](./ARCHITECTURE.md) for the engine design,
presets, the mode-switching rule and how to add a mode.

## Browser support

Needs Web Audio with AudioWorklet: current **Chrome**, **Edge**, **Safari**
(macOS / iOS) and **Firefox**, desktop and mobile.

- **Output device selection** inside the app needs `AudioContext.setSinkId`,
  which only Chromium browsers (Chrome, Edge, Opera…) support. Elsewhere,
  choose the receiver as the system audio output.
- Browsers require one click/tap before they play sound.
- Mobile browsers may suspend audio when the screen locks or the tab goes to
  the background.

## Safety

This application generates audio signals only. It does not control Tesla coil
voltage or electrical power. Always follow the manufacturer's operating
instructions. Tesla coils generate high voltage, UV radiation, electromagnetic
interference, and potentially hazardous discharges. Never touch the coil or
discharge area during operation.

Also: keep electronics, pacemakers and flammable materials away from the coil,
run it in a ventilated room (arcs produce ozone), and never leave it running
unattended.

## License

Released into the public domain under the [Unlicense](LICENSE).
