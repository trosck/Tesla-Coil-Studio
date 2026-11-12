import { describe, expect, it } from 'vitest';
import { renderPlayable } from '../audio/export/renderWav';
import { toSource, type Playable } from '../audio/types';
import { buildFrequency, normalizeFrequencyParams } from '../modes/frequency/build';
import { buildMelody, normalizeMelodyParams } from '../modes/melody/build';
import { buildPulsePlayable, normalizePulseParams } from '../modes/pulse/build';
import { buildRampSequence, normalizeRampParams } from '../modes/ramp/build';
import { buildRandomPlayable, normalizeRandomParams } from '../modes/random/build';
import { buildSequencer, normalizeSequencerParams } from '../modes/sequencer/build';
import { buildSirenSequence, normalizeSirenParams } from '../modes/siren/build';
import type { ModeId } from '../studio/types';
import { BUILT_IN_PRESETS, FEATURED_PRESET_IDS } from './builtIn';

/* eslint-disable @typescript-eslint/no-explicit-any */
const MODES: Partial<Record<ModeId, { normalize: (raw: unknown) => any; build: (p: any) => Playable | null }>> = {
  ramp: { normalize: normalizeRampParams, build: buildRampSequence },
  pulse: { normalize: normalizePulseParams, build: buildPulsePlayable },
  siren: { normalize: normalizeSirenParams, build: buildSirenSequence },
  random: { normalize: normalizeRandomParams, build: buildRandomPlayable },
  melody: { normalize: normalizeMelodyParams, build: buildMelody },
  sequencer: { normalize: normalizeSequencerParams, build: buildSequencer },
  frequency: { normalize: normalizeFrequencyParams, build: buildFrequency },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('built-in presets', () => {
  it('has the 10 library presets with unique, stable builtin-* ids', () => {
    expect(BUILT_IN_PRESETS).toHaveLength(10);
    const ids = BUILT_IN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of BUILT_IN_PRESETS) {
      expect(p.id).toMatch(/^builtin-[a-z0-9-]+$/);
      expect(p.builtIn).toBe(true);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description?.length ?? 0).toBeGreaterThan(10);
    }
    for (const id of FEATURED_PRESET_IDS) expect(ids).toContain(id);
  });

  it('covers the requested modes / variants', () => {
    const byId = new Map(BUILT_IN_PRESETS.map((p) => [p.id, p]));
    const dir = (id: string) => (byId.get(id)!.params as { direction: string }).direction;
    expect(dir('builtin-rising-siren')).toBe('rise');
    expect(dir('builtin-falling-siren')).toBe('fall');
    expect(dir('builtin-alternating-siren')).toBe('alternate');
    expect(byId.get('builtin-test-signal')!.mode).toBe('frequency');
    expect(byId.get('builtin-electronic-rhythm')!.mode).toBe('sequencer');
    expect(byId.get('builtin-random-lightning')!.mode).toBe('random');
    expect(byId.get('builtin-arpeggio')!.mode).toBe('melody');
    expect(byId.get('builtin-frequency-ramp')!.mode).toBe('ramp');
  });

  for (const preset of BUILT_IN_PRESETS) {
    describe(preset.name, () => {
      const m = MODES[preset.mode];

      it('passes normalizeParams unchanged', () => {
        expect(m).toBeDefined();
        expect(m!.normalize(preset.params)).toEqual(preset.params);
        // JSON round trip (localStorage / export) is lossless too
        expect(m!.normalize(JSON.parse(JSON.stringify(preset.params)))).toEqual(preset.params);
      });

      it('builds a playable with events in a coil-friendly range', () => {
        const playable = m!.build(m!.normalize(preset.params));
        expect(playable).not.toBeNull();
        const src = toSource(playable!);
        for (let i = 0; i < 3; i++) {
          const seq = src.chunk(i);
          expect(seq.length).toBeGreaterThan(0);
          expect(seq.events.length).toBeGreaterThan(0);
          for (const e of seq.events) {
            for (const f of [e.freqStart, e.freqEnd ?? e.freqStart]) {
              expect(f).toBeGreaterThanOrEqual(60);
              expect(f).toBeLessThanOrEqual(1600);
            }
            expect(e.gain).toBeGreaterThan(0);
            expect(e.gain).toBeLessThanOrEqual(1);
            expect(e.duration).toBeGreaterThan(0);
          }
        }
      });

      it('renders audible output below the ceiling', () => {
        const out = renderPlayable(m!.build(m!.normalize(preset.params))!, { durationSeconds: 1.5 });
        let peak = 0;
        for (const s of out) peak = Math.max(peak, Math.abs(s));
        expect(peak).toBeGreaterThan(0.3);
        expect(peak).toBeLessThanOrEqual(0.9 + 1e-6);
      });
    });
  }
});
