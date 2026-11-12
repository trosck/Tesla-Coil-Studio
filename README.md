# Tesla Coil Studio

A browser-only music generator for Bluetooth musical Tesla coils (for example
kits with an **MH-M18** Bluetooth audio receiver). It generates clean,
band-limited audio signals (square wave by default) in real time, shows what is
playing on a live oscilloscope and spectrum, records the output, and exports
WAV files. No backend, no account: everything runs in your browser.

The coil modulates its arc from the incoming audio. The app only produces
audio on your device's normal sound output; your operating system sends it to
the coil over Bluetooth.

## Quick start

```bash
pnpm install
pnpm dev        # open the printed URL
```

Other scripts: `pnpm build` (production build in `dist/`), `pnpm preview`,
`pnpm typecheck`, `pnpm lint`, `pnpm test`.

Requires a current Chromium, Firefox or Safari (Web Audio + AudioWorklet).

## Setup with an MH-M18 Bluetooth Tesla coil

1. Power the coil as described in its manual. Keep the discharge area clear.
2. On your computer or phone, open the Bluetooth settings and pair the device
   (it usually shows up as **MH-M18** or similar; no PIN, or `0000`).
3. Select it as the **system sound output** (macOS: Control Center → Sound;
   Windows: Sound output; Android/iOS: it becomes the output automatically).
4. Open Tesla Coil Studio, click **Enable audio** (browsers need one click
   before they play sound), go to the **Frequency** tab and press **PLAY** for
   a test tone. Start with a low master volume and raise it slowly.
5. Square wave (the default) gives the loudest, clearest arcs. The duty cycle
   slider changes the tone and arc intensity.

In Chromium-based browsers an output-device selector appears next to the
status indicator, so you can pick the coil without changing the system
default.

## Features

- Transport: play, pause/resume, stop, loop, record the output to WAV, export
  WAV (44.1 kHz / 16-bit, mono or stereo, by loops or duration, adjustable volume).
- Global waveform (square / sine / triangle / saw) and duty cycle.
- Live oscilloscope, spectrum, big frequency readout with note and cents,
  amplitude meter, BPM and position.
- Modes: Ramp, Pulse, Siren, Random, Melody, Sequencer, MIDI, Frequency,
  Presets. (Frequency and a basic preset list work now; the others are being built.)

Developers: see [ARCHITECTURE.md](./ARCHITECTURE.md) for the engine design and
how to add a mode.

## Safety

This application generates audio signals only. It does not control Tesla coil
voltage or electrical power. Always follow the manufacturer's operating
instructions. Tesla coils generate high voltage, UV radiation, electromagnetic
interference, and potentially hazardous discharges. Never touch the coil or
discharge area during operation.

Also: keep electronics, pacemakers and flammable materials away from the coil,
run it in a ventilated room (arcs produce ozone), and never leave it running
unattended.
